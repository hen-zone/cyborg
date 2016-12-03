import createSession from "./mfp/createSession";
import * as api from "./mfp/higherLevelApi";
import {alterDate} from "./mfp/util";
import * as ifttt from './iftttNotificationsApi';
import {incrementBeeminderGoal} from './beeminderApi';


const EXERCISE_TYPES = {
    APPLE_WATCH: {
        name: 'Apple Watch Activity',
        templateDate: '2016-08-15',
        id: 65259518
    },
    ROLLOVER: {
        name: 'Rollover',
        templateDate: '2016-06-01',
        id: 65848663
    }
};


async function parallelForEach(list, proc) {
    const promises = list.map(proc);
    for (let i = 0; i < promises.length; ++i) {
        await promises[i]; //Propagate errors
    }
}

async function setExerciseOfTypeForDate(session, type, date, calories) {
    const page = await api.exercisePageForDay(session, date);
    const existingInstances = await api.exercisesForNameFromPage(page, type.name);
    const totalExisting = existingInstances.reduce((cum, instance)=> cum + instance.calories, 0);

    console.log(`day ${date} has ${totalExisting}cal of ${type.name}`);

    if (totalExisting < calories) {
        api.createExerciseById(session, date, type.id, calories - totalExisting);
    } else if (totalExisting > calories) {
        await Promise.all(existingInstances.map(
            async instance => await api.deleteExerciseByIdAndDate(session, instance.id, date)
        ));
        await api.createExerciseById(session, date, type.id, calories);
    } else {
        console.log("Nothing to do — amount is aready correct");
    }
}

async function makeButtfractalSession() {
    return await createSession('buttfractal', 'pYWFHswkaMwBZm6kpqMo');
}

export async function setBonusesForDays(dayBonusPairs) {
    const session = await makeButtfractalSession();
    await parallelForEach(dayBonusPairs, async([date, bonus]) => {
        await setExerciseOfTypeForDate(session, EXERCISE_TYPES.APPLE_WATCH, date, bonus)
    });
}

export async function applyRolloverForDate(date) {
    const session = await makeButtfractalSession();
    const remaining = await api.remainingCaloriesForDay(session, date);
    let rollover = remaining < 0 ? 0 : (10 * ((remaining / 10) | 0));
    const nextDay = alterDate(date, 1);
    await setExerciseOfTypeForDate(session, EXERCISE_TYPES.ROLLOVER, nextDay, rollover);
    await incrementBeeminderGoal('food-diary');
}

const SMOOTHING_CONSTANT = 0.9;

const EPSILON = 0.1;

function smoothWeight(previousWeight, newWeight) {
    const rawDiff = newWeight - previousWeight;

    const smoothedDiff = (1 - SMOOTHING_CONSTANT) * rawDiff;

    const needsBiasing = (Math.abs(rawDiff) >= EPSILON) && (Math.abs(smoothedDiff) < EPSILON);

    const correctedDiff = needsBiasing ?
    EPSILON * Math.sign(rawDiff)
        : smoothedDiff;

    return Math.round((previousWeight + correctedDiff) / EPSILON) * EPSILON;
}

export async function setSmoothedWeightForDate(date, weight) {
    const session = await makeButtfractalSession();
    const recentWeights = await api.recentWeights(session);
    // find the most recent weight that is not this exact date;
    const mostRecentPreviousEntry = recentWeights.filter(it => it.date !== date)[0];
    const mostRecentWeight = mostRecentPreviousEntry ? mostRecentPreviousEntry.weight : weight;
    const smoothedWeight = smoothWeight(mostRecentWeight, weight);
    await api.setWeightForDate(session, date, smoothedWeight);

    await sendMessagesForWeightChange(mostRecentWeight, smoothedWeight);
    return smoothedWeight;
}

import WEIGHT_MESSAGES from './weightMessages';

export async function sendMessagesForWeightChange(oldWeight, newWeight) {
    const diff = oldWeight - newWeight;
    const basicResult = diff > 0 ?
        (`⚖️ Lost ${diff.toFixed(1)}, down to ${newWeight.toFixed(1)}!\n`)
        : '';
    const matchingMessages = WEIGHT_MESSAGES.filter(it => it[0] < oldWeight && it[0] >= newWeight);
    const joinedMessages = [basicResult].concat(matchingMessages.map(it => it[1])).join('\n');
    return await ifttt.sendNotification(joinedMessages);
}