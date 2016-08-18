import express from 'express';
import bodyParser from 'body-parser';

//noinspection JSUnresolvedVariable
const port = process.env.PORT || 3000;


const expressApp = express();

expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({extended: true}));

expressApp.get('/', async(req, res) => {
    res.json("FANTASTIC!");
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

expressApp.listen(port, () => {
    console.log('Started server!');
});