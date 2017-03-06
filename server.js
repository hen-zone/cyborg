import express from "express";
import bodyParser from "body-parser";
import SpotifyWebApi from 'spotify-web-api-node';

import {setBonusesForDays, applyRolloverForDate, setSmoothedWeightForDate, sendMessagesForWeightChange} from "./cyborgApi";
import {incrementBeeminderGoal} from "./beeminderApi";
import {validateDate, zeroPad} from "./mfp/util";
import * as MemCache from './memcached';

const authCode = 'AQAfl5Y9hHEpLqo0ZDFFneWIBp95aNR3QToCowaPWgRLTCfiI7pQUPKEWBCeEDr9HpGj6ZXSUVKfB0XeMwdqaFEpafo4wFe8omDHDa240beHDr7t-c_oENDVXNbyLhFVk52hSEyL5mJI8K9FdHy1N-ijQxpRI7tALiWgf1LaK57oHklRNl8il2sFnwxQeGTfrSHkhJ1EFpgfK5TpYQBKDe7D4Not6C5kBbVoIAKPoo8v_VPkwY42r5-Ai3HXLXccyC5e3GDuDkSpQGSxa3Je9MG25HkxI1UtWmGzJYI4qxUhXABh';

let SPOTIFY_CLIENT_ID = 'fb91152cd5fd475d9878399c2cb0c6cb';
let SPOTIFY_CLIENT_SECRET = '5b3e94fa7a6e473b86015bdd9320595d';
let SPOTIFY_REDIRECT_URI = 'http://localhost:3000/';

const HEN_SPOTIFY = '1232511708';



//noinspection JSUnresolvedVariable
const port = process.env.PORT || 3000;


const expressApp = express();

expressApp.use(bodyParser.json());
expressApp.use(bodyParser.text());
expressApp.use(bodyParser.urlencoded({extended: true}));

expressApp.get('/', async(req, res) => {
    res.json(`Try GETting with the form /accept-bonuses-from-workflow?mappings=[["2016-08-20", 270]]`);
});

expressApp.get('/favicon', async(req, res) => {
    res.json("Nothing here lol");
});

function normalizeDate(date) {
    try {
        return new Date(date.split(' at ')[0]).toISOString().split('T')[0];
    }
    catch(reason) {
        return '';
    }
}

async function handleSetWeightForDate(weight, date) {
    console.log('START: handleSetWeightForDate');
    const weightNum = Number(weight);
    const normalizedDate = normalizeDate(date);
    validateDate(normalizedDate);
    console.log('Validated date.');

    if (weightNum !== weightNum) {
        throw new Error(`weight was not a number: ${weight}`);
    }
    console.log('Validated weight.');

    const smoothedWeight = (await setSmoothedWeightForDate(date, weightNum));
    console.log('Done setting weight in MFP.');

    await incrementBeeminderGoal('weigh', true);
    console.log('Done applying beeminder increment.');

    console.log('END: handleSetWeightForDate');
    return smoothedWeight.toFixed(1);
}

let SPOTIFY_RECEIVE_CREDS_PATH = '/spotify/receive-creds';

function makeRedirectUri(req) {
    const port = req.get('port');
    return `${req.protocol}://${req.get('host')}${port ? ':' + port : ''}${SPOTIFY_RECEIVE_CREDS_PATH}`;
}
expressApp.get('/spotify/login', async (req, res) => {
    try {
        const redirectUri = makeRedirectUri(req);
        const scopes = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-follow-modify user-follow-read user-library-read user-library-modify user-read-private user-read-birthdate user-read-email user-top-read';
        res.redirect(`https://accounts.spotify.com/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&`);
    } catch (reason) {
        res.json({error: reason});
        console.error(reason.stack);
    }
    res.end();
});

async function getSpotifyHistory() {
    const encodedHistory = await MemCache.get('spotify-history');
    return new Set(JSON.parse(encodedHistory));
}

async function addToSpotifyHistory(ids) {
    const historySet = await getSpotifyHistory();
    ids.forEach(it => historySet.add(it));
    const reEncodedHistory = JSON.stringify(Array.from(historySet));
    return await MemCache.set('spotify-history', reEncodedHistory);
}


async function saveAccessCode(value) {
    return await MemCache.set('spotify-access-code', value);
}

async function saveRefreshCode(value) {
    return await MemCache.set('spotify-refresh-code', value);
}

async function makeSpotifyClient(req) {
    const spotifyApi = new SpotifyWebApi({
        clientId: SPOTIFY_CLIENT_ID,
        clientSecret: SPOTIFY_CLIENT_SECRET,
        redirectUri: makeRedirectUri(req),
    });

    spotifyApi.setAccessToken(await MemCache.get('spotify-access-code'));
    spotifyApi.setRefreshToken(await MemCache.get('spotify-refresh-code'));
    return spotifyApi;
}

const HISTORY_PLAYLIST = '0ly7f5t0ylwWIiW1wAtvHc';
const INBOX_PLAYLIST = '7LbKQZYipf8CfqH2eWoz5Q';
const PIPE_DREAM_PLAYLIST = '08vL7ksqd4ovzUb7AAcJi9';
const limit = 100;

async function getPagedPlaylist(spotifyApi, userId, playlistId) {
    const firstPage = await getSinglePlaylistPage(spotifyApi, userId, playlistId, 0);
    const numPages = Math.ceil(firstPage.total / 100);
    const pagePromises = [Promise.resolve(firstPage)];
    for (let i = 1; i < numPages; ++i) {
        pagePromises.push(getSinglePlaylistPage(spotifyApi, userId, playlistId, i * 100));
    }
    const resolvedPages = await Promise.all(pagePromises);
    return [].concat.apply([], resolvedPages.map(it => it.uris));
}

async function getSinglePlaylistPage(spotifyApi, userId, playlistId, offset=0) {
    console.log(`loading playlist ${userId}/${playlistId} at #${offset}`);
    const rawPage = await spotifyApi.getPlaylistTracks(
        userId,
        playlistId,
        { fields: "total,items(track(uri))", offset, limit },
    );
    let nextOffset = offset + limit;
    let total = rawPage.body.total;
    const moreNeeded = nextOffset < total;
    const uris = rawPage.body.items.map(it => it.track.uri).filter(uri => uri !== 'spotify:track:null');
    return { total, uris }
}

async function inBatches(limit, list, asyncProcess) {
    let remaining = [...list];
    while (remaining.length) {
        const subset = remaining.slice(0, limit);
        remaining = remaining.slice(limit);
        await asyncProcess(subset);
    }
}

expressApp.get('/spotify/history', async (req, res) => {
    try {
        const history = await getSpotifyHistory();
        return res.json(Array.from(history));
    } catch (reason) {
        res.json({error: reason});
        console.error(reason.stack);
    }
    res.end();
});

function getRandom(arr, n) {
    var result = new Array(n),
        len = arr.length,
        taken = new Array(len);
    if (n > len)
        throw new RangeError("getRandom: more elements taken than available");
    while (n--) {
        var x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len;
    }
    return result;
}

expressApp.get('/spotify/cut-pipe', async (req, res) => {
    try {
        const spotifyApi = await makeSpotifyClient(req);
        const pipeDream = await getPagedPlaylist(spotifyApi, HEN_SPOTIFY, PIPE_DREAM_PLAYLIST);
        console.log('loaded pipedream');
        const randomTracks = pipeDream.length > 30 ? getRandom(pipeDream, 30) : pipeDream;


        const lastPipeNumber = Number(await MemCache.get('spotify-pipe-number') || 0);
        const nextPipeNumber = lastPipeNumber + 1;
        await MemCache.set('spotify-pipe-number', String(nextPipeNumber));

        let name = `Pyro Pipe #${nextPipeNumber}`;
        console.log('about to create playlist');
        const playlistInfo = await spotifyApi.createPlaylist(HEN_SPOTIFY, name);
        console.log('created playlist');
        const newPlaylistId = playlistInfo.body.id;
        console.log(randomTracks);
        await spotifyApi.addTracksToPlaylist(HEN_SPOTIFY, newPlaylistId, randomTracks);
        await spotifyApi.removeTracksFromPlaylist(HEN_SPOTIFY, PIPE_DREAM_PLAYLIST, randomTracks.map(uri => ({uri})));


        return res.json({name: name, id: newPlaylistId, uri: playlistInfo.body.uri, tracks: randomTracks});
    } catch (reason) {
        res.json({error: reason});
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/spotify/inbox', async (req, res) => {
    try {
        const spotifyApi = await makeSpotifyClient(req);

        const history = await getSpotifyHistory();

        const playlistSpecs = [
            ['inbox', HEN_SPOTIFY, INBOX_PLAYLIST],
            ['henDiscover', 'spotify', '37i9dQZEVXcORpwpJL9ceh'],
            ['henReleaseRadar', 'spotify', '37i9dQZEVXbbXNiJeLtLv3'],
            ['djoDiscover', 'spotify', '37i9dQZEVXcNPxeqxshEf9'],
            ['livvyDiscover', 'spotify', '37i9dQZEVXcJP0NgDg2X0T'],
            ['desmondDiscover', 'spotify', '37i9dQZEVXcISf3FIRhvUD'],
            ['henShazamTracks', '1232511708', '1JBCsNUmAdZw4xIkZOW90r'],
            ['pitchforkOfficialTracks', 'pitchfork', '7q503YgioHAbo1iOIa67M8'],
            ['pitchforkUnofficialAlbums', 'kenove', '6QdRN6dPnook9KPezrggaO'],
            ['jjjHitList', 'triple.j.abc', '7vFQNWXoblEJXpbnTuyz76'],
            ['pitchforkUnofficialTracks', 'szymonczarnowski', '2LkZTDKWPelJv7HNY9rQV7'],
            // ['izaakDiscover', 'spotify', '37i9dQZEVXcDc5DQak61yg'],
            // ['izaakRadar', 'spotify', '37i9dQZEVXbe7LBY0sEzoU'],
            // ['djoRadar', 'spotify', '37i9dQZEVXbwEaUu0bjFU6'],
        ];

        const actualPlaylists = await Promise.all(playlistSpecs.map(async spec => {
            return [spec[0], await getPagedPlaylist(spotifyApi, spec[1], spec[2])];
        }));

        console.log('All playlists read: ', actualPlaylists);

        let allNewTracks = [];
        let totalScanned = 0;

        actualPlaylists.forEach(pair => {
            const [name, tracks] = pair;
            tracks.forEach(uri => {
                if (! history.has(uri)) allNewTracks.push(uri);
                ++ totalScanned;
            })
        });

        console.log(`Scanned ${totalScanned} tracks; found ${allNewTracks.length} new ones.`);

        await inBatches(70, allNewTracks, async(batch) => {
            console.log(`about to add ${batch.length} tracks to pipe dream...:`, batch);
            await spotifyApi.addTracksToPlaylist(
                HEN_SPOTIFY,
                PIPE_DREAM_PLAYLIST,
                batch,
            );
            console.log(`about to add ${batch.length} tracks to history...`);
            await addToSpotifyHistory(batch);
        });

        await inBatches(70, actualPlaylists[0][1], async them => {
            console.log(`about to remove ${them.length} tracks from inbox...`);
            await spotifyApi.removeTracksFromPlaylist(HEN_SPOTIFY, INBOX_PLAYLIST, them.map(uri => ({uri})));
        });


        res.json({
            success: "Processed.",
            addedToPipeDream: allNewTracks.length,
            totalScanned: totalScanned,
        });
    } catch (reason) {
        res.json({error: reason});
        console.error(reason);
    }
    res.end();
});

expressApp.get(SPOTIFY_RECEIVE_CREDS_PATH, async (req, res) => {
    try {
        const preAuthSpotifyApi = await makeSpotifyClient(req);

        const granted = await preAuthSpotifyApi.authorizationCodeGrant(req.query.code);

        saveAccessCode(granted.body['access_token']);
        saveRefreshCode(granted.body['refresh_token']);

        const authedSpotifyApi = await makeSpotifyClient(req);

        res.json({
            success: "Logged into spotify!",
            query: req.query,
            savedSongs: await authedSpotifyApi.getMySavedTracks({limit: 10}),
        });
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
});


expressApp.get('/set-data', async (req, res) => {
    try {
        const keyValPairs = Object.entries(req.query);
        await Promise.all(keyValPairs.map(async pair => {
            const [key, value] = pair;
            await MemCache.set(key, value);
        }));
        res.json({"success": `Set the values`, "params": req.query});
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/get-data/:key', async (req, res) => {
    try {
        res.json(await MemCache.get(req.params.key));
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/brush-teeth', async (req, res) => {
    try {
        await incrementBeeminderGoal('brush-teeth');
        res.json({"success": "👍🏻"});
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/daily-routine', async (req, res) => {
    try {
        await incrementBeeminderGoal('daily-routine');
        res.json({"success": "👍🏻"});
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/set-weight-for-date', async (req, res) => {
    console.log('START: handling set-weight-for-date');
    try {
        const {weight, date} = req.query;
        res.json({success: await handleSetWeightForDate(weight, date)});
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
    console.log('END: handling set-weight-for-date');
});

function parseMappings(mappings) {
    try {
        const result = JSON.parse(decodeURIComponent(mappings));
        if (! result || typeof result.length !== 'number') {
            throw new Error();
        }
        return result;
    } catch (reason) {
        throw new Error('Mappings were not a valid JSON array.')
    }
}

expressApp.get('/apply-rollover', async (req, res) => {
    try {
        const {date} = req.query;
        validateDate(date);
        await applyRolloverForDate(date);
        res.json({success: `Applied rollover for ${date}`})
    } catch (reason) {
        res.json({error: String(reason)});
    }
    res.end();
});

expressApp.post('/parse-tweet', async (req, res) => {
    const tweet = req.body;
    res.json({success: "Nice! Thanks for this tasty tweet to parse!"});
    res.end();

    if (! /#myfitnesspal/.test(tweet)) {
        console.log('not an MFP tweet; dropping.');
        return;
    } else {
        const diaryNoticeParts = tweet.match(/completed his food and exercise diary for (\S+)/);
        if (diaryNoticeParts) {
            const [month, day, year] = diaryNoticeParts[1].split('/');
            const normalizedDate = `${year}-${zeroPad(month)}-${zeroPad(day)}`;
            await applyRolloverForDate(normalizedDate);
        }
    }
});

expressApp.get('/accept-bonuses-from-workflow', async (req, res) => {
    try {
        const {mappings} = req.query;

        if (! mappings) {
            throw new Error('No mappings parameter was provided.');
        }
        const parsedMappings = parseMappings(mappings);
        res.json({success:'Setting bonuses asynchronously now!'});
        res.end();
        await setBonusesForDays(parsedMappings);
    } catch(reason) {
        console.error(reason.stack);
    }
});

expressApp.listen(port, () => {
    console.log(`Started server on port ${port}`);
});