import {applyRolloverForDate, setSmoothedWeightForDate} from "./cyborgApi";
import {incrementBeeminderGoal} from "./beeminderApi";
import {validateDate, zeroPad} from "./mfp/util";


function normalizeDate(date) {
    try {
        return new Date(date.split(' at ')[0]).toISOString().split('T')[0];
    }
    catch(reason) {
        return '';
    }
}

export async function handleSetWeightForDate(weight, date) {
    console.log('START: handleSetWeightForDate');
    const weightNum = Number(weight);
    const normalizedDate = normalizeDate(date);
    validateDate(normalizedDate);
    console.log('Validated date.');

    if (weightNum !== weightNum) {
        throw new Error(`weight was not a number: ${weight}`);
    }
    console.log('Validated weight.');

    const {smoothedWeight, messages} = (await setSmoothedWeightForDate(date, weightNum));
    console.log('Done setting weight in MFP.');

    await incrementBeeminderGoal('weigh', true);
    console.log('Done applying beeminder increment.');

    console.log('END: handleSetWeightForDate');
    return {weight: smoothedWeight.toFixed(1), messages};
}



export async function parseTweet(tweet) {
    if (!/#myfitnesspal/.test(tweet)) {
        console.log('not an MFP tweet; dropping.');
    } else {
        const diaryNoticeParts = tweet.match(/completed his food and exercise diary for (\S+)/);
        if (diaryNoticeParts) {
            const [month, day, year] = diaryNoticeParts[1].split('/');
            const normalizedDate = `${year}-${zeroPad(month)}-${zeroPad(day)}`;
            await applyRolloverForDate(normalizedDate);
        }
    }
}
