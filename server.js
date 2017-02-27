import express from "express";
import bodyParser from "body-parser";
import SpotifyWebApi from 'spotify-web-api-node';

import {setBonusesForDays, applyRolloverForDate, setSmoothedWeightForDate, sendMessagesForWeightChange} from "./cyborgApi";
import {incrementBeeminderGoal} from "./beeminderApi";
import {validateDate, zeroPad} from "./mfp/util";

// const authCode = 'AQAfl5Y9hHEpLqo0ZDFFneWIBp95aNR3QToCowaPWgRLTCfiI7pQUPKEWBCeEDr9HpGj6ZXSUVKfB0XeMwdqaFEpafo4wFe8omDHDa240beHDr7t-c_oENDVXNbyLhFVk52hSEyL5mJI8K9FdHy1N-ijQxpRI7tALiWgf1LaK57oHklRNl8il2sFnwxQeGTfrSHkhJ1EFpgfK5TpYQBKDe7D4Not6C5kBbVoIAKPoo8v_VPkwY42r5-Ai3HXLXccyC5e3GDuDkSpQGSxa3Je9MG25HkxI1UtWmGzJYI4qxUhXABh';
//
// const spotifyApiPromise = (async () => {
//     const spotifyApi = new SpotifyWebApi({
//         clientId : 'fb91152cd5fd475d9878399c2cb0c6cb',
//         clientSecret : '5b3e94fa7a6e473b86015bdd9320595d',
//         redirectUri: 'http://localhost:3000/',
//     });
//     const granted = await spotifyApi.authorizationCodeGrant(authCode);
//     spotifyApi.setAccessToken(granted.body['access_token']);
//     spotifyApi.setRefreshToken(granted.body['refresh_token']);
//     return spotifyApi;
// })();
//
// const HEN_SPOTIFY = '1232511708';
//
//
// // https://accounts.spotify.com/authorize?response_type=code&redirect_uri=http://localhost:3000/&scope=playlist-modify-private+playlist-read-private+user-library-read+user-library-modify&client_id=fb91152cd5fd475d9878399c2cb0c6cb
//
// (async function() {
//     try {
//         const spotifyApi = await spotifyApiPromise;
//         return await spotifyApi.getMySavedTracks({limit: 100});
//
//     } catch(issue) {
//         console.log(issue);
//     }
// })().then(console.log, console.error);

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
    const weightNum = Number(weight);
    const normalizedDate = normalizeDate(date);
    validateDate(normalizedDate);

    if (weightNum !== weightNum) {
        throw new Error(`weight was not a number: ${weight}`);
    }

    const smoothedWeight = (await setSmoothedWeightForDate(date, weightNum));

    await incrementBeeminderGoal('weigh', true);

    return smoothedWeight.toFixed(1);
}

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
    try {
        const {weight, date} = req.query;
        res.json({success: await handleSetWeightForDate(weight, date)});
    } catch (reason) {
        res.json({error: String(reason)});
        console.error(reason.stack);
    }
    res.end();
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
    console.log('Started server!');
});