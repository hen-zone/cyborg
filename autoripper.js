import spotifyApp from "spotify-node-applescript";
import osascript from "node-osascript";
import { getPagedPlaylistWithTrackInfo, makeSpotifyClient } from "./spotify";
import fs from "fs";
import { promisifyAll } from "bluebird";

promisifyAll(spotifyApp);
promisifyAll(fs);

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function fileExists(path) {
    return new Promise((ok, fail) => {
        fs.stat(path, function(err, stat) {
            if (!err) {
                ok(true);
            } else if (err.code === "ENOENT") {
                // file does not exist
                ok(false);
            } else {
                fail(err);
            }
        });
    });
}

function asyncOsascriptExecute(script) {
    return new Promise((succeed, fail) => {
        osascript.execute(script, function(err, result, raw) {
            if (err) fail(err);
            else succeed(result);
        });
    });
}

function asyncPlayTrack(uri) {
    return new Promise(accept => {
        spotifyApp.playTrack(uri, accept);
    });
}

const startRecording = `
tell app "Finder" to set allProcs to name of processes

if allProcs contains "Spotify" then tell application "Spotify" to quit
if allProcs contains "Audio Hijack" then tell application "Audio Hijack" to quit

delay 2

tell application "Spotify" to activate

delay 2


tell application "Audio Hijack"
	activate
	tell application "System Events"
		key code 124
		keystroke "o" using {command down}
		keystroke "r" using {command down}
	end tell
end tell
`;

const stopRecording = `
tell application "Spotify" to quit
tell application "Audio Hijack"
	activate
	tell application "System Events"
		keystroke "r" using {command down}
    end tell
    delay 10
    quit
end tell
`;

function sleep(time) {
    return new Promise(ok => {
        setTimeout(ok, time);
    });
}

function asyncReadDir(path) {
    return new Promise((ok, fail) => {
        fs.readdir(path, function(err, items) {
            if (err) fail(err);
            else ok(items);
        });
    });
}

function asyncRename(fromPath, toPath) {
    return new Promise((ok, fail) => {
        fs.rename(fromPath, toPath, function(err) {
            if (err) fail(err);
            else ok();
        });
    });
}

const STAGING_DIR = "/Users/hen/Music/Audio\ Hijack";
const RIP_DIR = "/Users/hen/Documents/synced-music/rips";

let alreadyRipping = false;

export async function ripPlaylist(req, userId, playlistId) {
    if (alreadyRipping) {
        throw new Error(
            "tried to re-enter the ripping comand! Only one ripper instance allowed."
        );
    } else {
        console.log("Safe to enter ripPlaylist");
    }
    alreadyRipping = true;
    const client = await makeSpotifyClient(req);

    console.log("we made a client!");

    const tracks = await getPagedPlaylistWithTrackInfo(
        client,
        userId,
        playlistId
    );

    const tracksToRip = [];

    for (let i = 0; i < tracks.length; ++i) {
        const track = tracks[i];
        // console.log('processing track', track);
        const trackName = track.name;
        const artistName = (track.artists[0] || track.album.artists[0]).name;
        const albumName = track.album.name;
        const durationSec = track.duration_ms / 1000 | 0;

        console.log(
            [
                artistName,
                trackName,
                albumName,
                (durationSec / 60 | 0) + ":" + durationSec % 60,
            ].join("~x~")
        );

        const desiredFileName = `${artistName}_-_${trackName}.mp3`.replace(
            /[\/:]/g,
            "-"
        );
        const desiredPath = `${RIP_DIR}/${desiredFileName}`;

        if (!await fileExists(desiredPath)) {
            tracksToRip.push({ ...track, desiredPath });
        }
    }

    tracksToRip.sort((a, b) => a.duration_ms - b.duration_ms);

    console.log(
        `Skipping ${tracks.length - tracksToRip.length} already-ripped tracks`
    );

    let durationRemaining = tracksToRip.reduce(
        (total, next) => total + next.duration_ms,
        0
    );

    // TODO: separate each rip session into a startup, ripping, and shutdown phase

    let i = 0;

    while (i < tracksToRip.length) {
        try {
            // TODO: clear the staging directory completely before each rip

            let ONE_HOUR = 60 * 60 * 1000;
            const hoursRemaining = durationRemaining / ONE_HOUR | 0;
            const minutesRemaining = durationRemaining %
                ONE_HOUR /
                (60 * 1000) |
                0;
            console.log(
                `\n\n${hoursRemaining}h${minutesRemaining}m remaining to rip (${tracksToRip.length - i} tracks)`
            );
            const track = tracksToRip[i];
            const duration = track.duration_ms;
            const desiredPath = track.desiredPath;

            const oldFiles = await fs.readdirAsync(STAGING_DIR);
            if (oldFiles.length)
                console.log(
                    `There were ${oldFiles.length} old files in the audio hijack folder; deleting now.`
                );
            await Promise.all(
                oldFiles.map(it => fs.unlinkAsync(STAGING_DIR + "/" + it))
            );

            try {
                console.log(
                    "Attempting to stop the apps, in case they are still runnning."
                );
                await asyncOsascriptExecute(
                    `
                    tell application "Spotify" to quit
                    tell application "Audio Hijack" to quit
                `
                );
                console.log("Stopped the apps successfully; that is nice.");
            } catch (it) {
                console.log(
                    "Got an error trying the stop the apps, so they were probably not running."
                );
            }

            console.log(`Now ripping ${track.name}`);

            console.log("about to start the recorder...");
            await asyncOsascriptExecute(startRecording);
            console.log("...recorder started. About to play track...");
            await asyncPlayTrack(track.uri);
            console.log("...playing track now.");
            console.log(
                `About to sleep for ${duration / 60000 | 0}min ${duration % 60000 / 1000 | 0}sec...`
            );
            await sleep(duration);
            console.log("...Done sleeping! about to stop recording...");
            await asyncOsascriptExecute(stopRecording);
            console.log("...stopped recording.");
            const rippedDirContents = await asyncReadDir(STAGING_DIR);
            if (rippedDirContents.length !== 1)
                throw new Error(
                    "There were multiple files in the staging directory!"
                );
            const lastRipped = rippedDirContents[rippedDirContents.length - 1];

            if (lastRipped) {
                const oldName = `${STAGING_DIR}/${lastRipped}`;
                console.log(
                    "Located our file; Moving " + oldName + " to " + desiredPath
                );
                await asyncRename(`${STAGING_DIR}/${lastRipped}`, desiredPath);
            } else {
                console.log(
                    "After ripping, there was no file there? wtf... throwing an exception to force a retry"
                );
                throw new Error("File not found");
            }

            durationRemaining -= duration;

            ++i;
        } catch (issue) {
            console.log(
                "Caught an error while trying to rip. Retrying that track now."
            );
            console.log("error was:", issue);
        }
    }

    alreadyRipping = false;
    console.log("done ripping!");
}

export async function testRipping(req) {
    return await ripPlaylist(req, "1232511708", "2Ug9uupzKMwvhRipGP5GNb");
}

export async function ripFromCommandLine() {
    return await testRipping({
        get() {
            return "x";
        },
    });
}
