import express from "express";
import bodyParser from "body-parser";
import {setBonusesForDays, applyRolloverForDate, setSmoothedWeightForDate, sendMessagesForWeightChange} from "./cyborgApi";
import {incrementBeeminderGoal} from "./beeminderApi";
import {validateDate, zeroPad} from "./mfp/util";


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

    await incrementBeeminderGoal('weigh');

    return smoothedWeight;
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
        await incrementBeeminderGoal('food-diary');
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
        await setBonusesForDays(parsedMappings);
        res.json({success:'Set bonuses successfully!'})
    } catch(reason) {
        console.error(reason.stack);
        res.json({error: String(reason)});
    }

    res.end();
});

expressApp.listen(port, () => {
    console.log('Started server!');
});