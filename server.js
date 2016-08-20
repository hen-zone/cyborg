import express from 'express';
import bodyParser from 'body-parser';

import {setBonusesForDays} from './bonuses'



//noinspection JSUnresolvedVariable
const port = process.env.PORT || 3000;


const expressApp = express();

expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({extended: true}));

expressApp.get('/', async(req, res) => {
    res.json(`Try GETting with the form /accept-bonuses-from-workflow?mappings=[["2016-08-20", 270]]`);
});

expressApp.get('/favicon', async(req, res) => {
    res.json("Nothing here lol");
});

expressApp.post('/add-weight', async(req, res) => {
    try {
        const {body} = req;
        const {weight, username, password} = body;

        if (!username || !password || !weight) {
            throw new Error("username, password and weight must all be specified in your post body.");
        }

        if (weight !== String(Number(weight))) {
            throw new Error(`The weight parameter (${weight}) was not a number.`);
        }

        // const result = await addSmoothedWeight(username, password, Number(weight));
        // console.log(result);
        // res.json(result);
    } catch (error) {
        const reason = error && error.stack || error;
        console.error("failed:", reason);
        res.json({error: 'Sorry, the weight thing failed! check logs.'});
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

expressApp.post('/parse-tweet', async (req, res) => {
    const {tweet} = req.body;
    console.log(`received this body on the parse-tweet endpoint: ${JSON.stringify(tweet)}`);
    res.json({success: "Nice! Thanks for this tasty tweet to parse!"});
    res.end();

    if (! /#myfitnesspal/.test(tweet)) {
        console.log('not an MFP tweet; dropping.')
        return;
    } else {
        const diaryNoticeParts = tweet.match(/completed his food and exercise diary for (\S+)/);
        if (diaryNoticeParts) {
            console.log(`This looks like a diary completion for ${diaryNoticeParts[1]}`);
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