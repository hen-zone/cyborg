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

async function getPagedPlaylist(spotifyApi, userId, playlistId, offset=0) {
    console.log(`loading with offset ${offset}...`);
    const rawPage = await spotifyApi.getPlaylistTracks(
        userId,
        playlistId,
        { fields: "total,items(track(uri))", offset, limit },
    );
    let nextOffset = offset + limit;
    const moreNeeded = nextOffset < rawPage.body.total;
    const ids = rawPage.body.items.map(it => it.track.uri);
    if (moreNeeded) {
        return [...ids, ...(await getPagedPlaylist(spotifyApi, userId, playlistId, nextOffset))];
    } else {
        return ids;
    }
}

async function inBatches(limit, list, asyncProcess) {
    let remaining = [...list];
    while (remaining.length) {
        const subset = remaining.slice(0, limit);
        remaining = remaining.slice(limit);
        await asyncProcess(subset);
    }
}

expressApp.get('/spotify/inbox', async (req, res) => {
    try {
        const spotifyApi = await makeSpotifyClient(req);

        let inbox = new Set(await getPagedPlaylist(spotifyApi, HEN_SPOTIFY, INBOX_PLAYLIST));
        const history = await getSpotifyHistory();

        const newIds = [];
        const oldIds = [];

        inbox.forEach(it => {
            (history.has(it) ? oldIds : newIds).push(it);
        });

        // work in batches of 70

        await inBatches(70, newIds, async(batch) => {
            console.log(`about to add ${batch.length} tracks to pipe dream...`);
            await spotifyApi.addTracksToPlaylist(
                HEN_SPOTIFY,
                PIPE_DREAM_PLAYLIST,
                batch,
            );
            console.log(`about to remove ${batch.length} tracks from inbox...`);
            await spotifyApi.removeTracksFromPlaylist(HEN_SPOTIFY, INBOX_PLAYLIST, batch.map(uri => ({uri})));
            console.log(`about to add ${batch.length} tracks to history...`);
            await addToSpotifyHistory(batch);
        });


        res.json({
            success: "Processed.",
            addedToPipeDream: newIds.length,
            alreadySeen: oldIds.length,
        });
    } catch (reason) {
        res.json({error: reason});
        console.error(reason.stack);
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