import spotifyApp from 'spotify-node-applescript'
import osascript from 'node-osascript';
import { getPagedPlaylistWithTrackInfo, makeSpotifyClient } from "./spotify";
import fs from 'fs';
import { promisifyAll } from 'bluebird';

promisifyAll(spotifyApp);
promisifyAll(fs);

function fileExists(path) {
    return new Promise((ok, fail) => {
        fs.stat(path, function (err, stat) {
            if (!err) {
                ok(true);
            } else if (err.code === 'ENOENT') {
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
        osascript.execute(script, function (err, result, raw) {
            if (err) fail(err);
            else succeed(result);
        });
    })
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
    delay 5
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
        fs.readdir(path, function (err, items) {
            if (err) fail(err);
            else ok(items);
        });
    })
}

function asyncRename(fromPath, toPath) {
    return new Promise((ok, fail) => {
        fs.rename(fromPath, toPath, function (err) {
            if (err) fail(err);
            else ok();
        });
    })
}

const STAGING_DIR = '/Users/hen/Music/Audio\ Hijack';
const RIP_DIR = '/Users/hen/Documents/synced-music/rips';

export async function ripPlaylist(req, userId, playlistId) {
    const client = await makeSpotifyClient(req);

    const tracks = await getPagedPlaylistWithTrackInfo(client, userId, playlistId);

    // TODO: have a rip dir where we can keep already-ripped stuff

    // TODO: do a cleaner startup/shutdown of Spotify and Audio Hijack each time

    // TODO: filter the songs to those that are unripped FIRST, then display the time remaining in minutes
    // after each track is ripped



    const tracksToRip = [];

    for (let i = 0; i < tracks.length; ++i) {
        const track = tracks[i];
        // console.log('processing track', track);
        const trackName = track.name;
        const artistName = (track.artists[0] || track.album.artists[0]).name;
        const desiredFileName = `${artistName}_-_${trackName}.mp3`.replace(/[\/:]/g, '-');
        const desiredPath = `${RIP_DIR}/${desiredFileName}`;

        if (!(await fileExists(desiredPath))) {
            tracksToRip.push({ ...track, desiredPath })
        }
    }

    tracksToRip.sort((a, b) => a.duration_ms - b.duration_ms);

    console.log(`Skipping ${tracks.length - tracksToRip.length} already-ripped tracks`);

    let durationRemaining = tracksToRip.reduce((total, next) => total + next.duration_ms, 0);

    // TODO: separate each rip session into a startup, ripping, and shutdown phase


    let i = 0;
    while (i < tracksToRip.length) {
        try {
            // TODO: clear the staging directory completely before each rip

            let ONE_HOUR = (60 * 60 * 1000);
            const hoursRemaining = durationRemaining / ONE_HOUR | 0;
            const minutesRemaining = (durationRemaining % ONE_HOUR) / (60 * 1000) | 0;
            console.log(`${hoursRemaining}h${minutesRemaining}m remaining to rip (${tracksToRip.length - i} tracks)`)
            const track = tracksToRip[i];
            const duration = track.duration_ms;
            const desiredPath = track.desiredPath;

            const oldFiles = await fs.readdirAsync(STAGING_DIR);
            await Promise.all(oldFiles.map(it => fs.unlinkAsync(STAGING_DIR + '/' + it)));

            durationRemaining -= duration;

            console.log(`Now ripping to ${desiredPath}`);

            // TODO: kill both Spotify and Audio Hijack if they are open

            await asyncOsascriptExecute(startRecording);
            await asyncPlayTrack(track.uri);
            await sleep(duration);
            await asyncOsascriptExecute(stopRecording);
            const rippedDirContents = await asyncReadDir(STAGING_DIR);
            const lastRipped = rippedDirContents[rippedDirContents.length - 1];

            if (lastRipped) {
                const oldName = `${STAGING_DIR}/${lastRipped}`;
                console.log('Moving ' + oldName + ' to ' + desiredPath);
                await asyncRename(`${STAGING_DIR}/${lastRipped}`, desiredPath)
            } else {
                console.log('After ripping, there was no file there? wtf... moving on')
            }

            ++i;
        } catch (issue) {
            console.log('Caught an error while trying to rip. Retrying that track now.');
            console.log('error was:', issue);
        }
    }
}


export async function testRipping(req) {
    return await ripPlaylist(req, '1232511708', '2Ug9uupzKMwvhRipGP5GNb');
}

export async function ripFromCommandLine() {
    return await testRipping({ get() { return 'x' } });
};