import express from 'express';
import bodyParser from 'body-parser';

import {setBonusesForDays, applyRolloverForDate, setWeightForDate} from './bonuses'
import {validateDate} from './mfp/util';



//noinspection JSUnresolvedVariable
const port = process.env.PORT || 3000;

/*
 *
 *
 *
 *
 * TODO: Add beeminder callbacks also! For weight/diary.
 *
 *
 *
 *
 *
 *
 */

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

async function handleSetWeightForDate(weight, date) {
    const weightNum = Number(weight);
    const normalizedDate = new Date(date.split(' at ')).toISOString().split('T')[0];
    validateDate(date);

    if (weightNum !== weightNum) {
        throw new Error(`weight was not a number: ${weight}`);
    }

    await setWeightForDate(date, weightNum);

    return `Set weight ${weight} for date ${date}`;
}

expressApp.get('/set-weight-for-date', async (req, res) => {
    try {
        const {weight, date} = req.query;
        res.json({success: await handleSetWeightForDate(weight, date)});
    } catch (reason) {
        res.json({error: String(reason)});
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
            const zeroPad = it => it.length === 1 ? `0${it}` : it;
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