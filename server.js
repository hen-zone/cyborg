import express from 'express';
import bodyParser from 'body-parser';
import { setBonusesForDays, applyRolloverForDate } from './cyborgApi';
import { incrementBeeminderGoal } from './beeminderApi';
import { validateDate } from './mfp/util';
import * as MemCache from './memcached';
import {
    receiveSpotifyCreds,
    getSpotifyHistory,
    cutPipe,
    scanInboxes,
    SPOTIFY_RECEIVE_CREDS_PATH,
    makeSpotifyRedirectUri,
} from './spotify';
import { handleSetWeightForDate, parseTweet } from './body-stuff';
import {testRipping} from "./autoripper";

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
expressApp.use(bodyParser.urlencoded({ extended: true }));

expressApp.get('/', async (req, res) => {
    res.json(
        `Try GETting with the form /accept-bonuses-from-workflow?mappings=[["2016-08-20", 270]]`
    );
});

expressApp.get('/favicon', async (req, res) => {
    res.json('Nothing here lol');
});


expressApp.get('/spotify/auto-rip', async (req, res) => {
    try {
        await testRipping(req);
        res.json({success: true});
    } catch (reason) {
        res.json({ error: reason });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/spotify/login', async (req, res) => {
    try {
        const redirectUri = makeSpotifyRedirectUri(req);
        const scopes = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-follow-modify user-follow-read user-library-read user-library-modify user-read-private user-read-birthdate user-read-email user-top-read';
        res.redirect(
            `https://accounts.spotify.com/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&`
        );
    } catch (reason) {
        res.json({ error: reason });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/spotify/history', async (req, res) => {
    try {
        const history = await getSpotifyHistory();
        return res.json(Array.from(history));
    } catch (reason) {
        res.json({ error: reason });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/spotify/cut-pipe', async (req, res) => {
    try {
        let result = await cutPipe(req);
        return res.json(result);
    } catch (reason) {
        res.json({ error: reason });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/spotify/inbox', async (req, res) => {
    try {
        let result = await scanInboxes(req);

        res.json({
            success: 'Processed.',
            ...result,
        });
    } catch (reason) {
        res.json({ error: reason });
        console.error(reason);
    }
    res.end();
});

expressApp.get(SPOTIFY_RECEIVE_CREDS_PATH, async (req, res) => {
    try {
        let confirmationSong = await receiveSpotifyCreds(req);

        res.json({
            success: 'Logged into spotify!',
            query: req.query,
            confirmationSong: confirmationSong,
        });
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/set-data', async (req, res) => {
    try {
        const keyValPairs = Object.entries(req.query);
        await Promise.all(
            keyValPairs.map(async pair => {
                const [key, value] = pair;
                await MemCache.set(key, value);
            })
        );
        res.json({ success: `Set the values`, params: req.query });
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/get-data/:key', async (req, res) => {
    try {
        res.json(await MemCache.get(req.params.key));
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/brush-teeth', async (req, res) => {
    try {
        await incrementBeeminderGoal('brush-teeth');
        res.json({ success: '👍🏻' });
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/daily-routine', async (req, res) => {
    try {
        await incrementBeeminderGoal('daily-routine');
        res.json({ success: '👍🏻' });
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
});

expressApp.get('/set-weight-for-date', async (req, res) => {
    console.log('START: handling set-weight-for-date');
    try {
        const { weight, date } = req.query;
        let result = await handleSetWeightForDate(weight, date);
        res.json({ success: true, weight: result.weight, messages: result.messages });
    } catch (reason) {
        res.json({ error: String(reason) });
        console.error(reason.stack);
    }
    res.end();
    console.log('END: handling set-weight-for-date');
});

expressApp.get('/apply-rollover', async (req, res) => {
    try {
        const { date } = req.query;
        validateDate(date);
        await applyRolloverForDate(date);
        res.json({ success: `Applied rollover for ${date}` });
    } catch (reason) {
        res.json({ error: String(reason) });
    }
    res.end();
});

expressApp.post('/parse-tweet', async (req, res) => {
    const tweet = req.body;
    res.json({ success: 'Nice! Thanks for this tasty tweet to parse!' });
    res.end();
    await parseTweet(tweet);
});

function parseMappings(mappings) {
    try {
        const result = JSON.parse(decodeURIComponent(mappings));
        if (!result || typeof result.length !== 'number') {
            throw new Error();
        }
        return result;
    } catch (reason) {
        throw new Error('Mappings were not a valid JSON array.');
    }
}

expressApp.get('/accept-bonuses-from-workflow', async (req, res) => {
    try {
        const { mappings } = req.query;

        if (!mappings) {
            throw new Error('No mappings parameter was provided.');
        }
        const parsedMappings = parseMappings(mappings);
        res.json({ success: 'Setting bonuses asynchronously now!' });
        res.end();
        await setBonusesForDays(parsedMappings);
    } catch (reason) {
        console.error(reason.stack);
    }
});

expressApp.listen(port, () => {
    console.log(`Started server on port ${port}`);
});
