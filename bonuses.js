import createSession from './mfp/createSession';
import * as api from './mfp/higherLevelApi';
import {alterDate} from './mfp/util';

const EXERCISE_TYPES = {
    APPLE_WATCH: {
        name: 'Apple Watch Activity',
        templateDate: '2016-08-15'
    },
    ROLLOVER: {
        name: 'Rollover',
        templateDate: '2016-06-01'
    }
};

async function parallelForEach(list, proc) {
    const promises = list.map(proc);
    for (let i = 0; i < promises.length; ++i) {
        await promises[i]; //Propagate errors
    }
}

async function setExerciseOfTypeForDate(session, type, date, calories) {
    async function getCurrentExcercise() {
        let page = await api.exercisePageForDay(session, date);
        return api.exerciseForNameFromPage(page, type.name);
    }

    async function createExercise() {
        await api.cloneExercise(session, type.templateDate, date);
        return await getCurrentExcercise();
    }

    let exerciseInstance = (await getCurrentExcercise()) || (await createExercise());

    if (! exerciseInstance) {
        throw new Error(`Could not get existing exercise of type ${type.name} for date ${date},`
            + ` and cloning from the template date failed.`);
    }

    await api.modifyExercise(session, exerciseInstance.id, calories);
}

async function makeButtfractalSession() {
    return await createSession('buttfractal', 'my8192fitnesspal');
}

export async function setBonusesForDays(dayBonusPairs) {
    const session = await makeButtfractalSession();
    await parallelForEach(dayBonusPairs, async ([date, bonus]) => {
        await setExerciseOfTypeForDate(session, EXERCISE_TYPES.APPLE_WATCH, date, bonus)
    });
}

export async function applyRolloverForDate(date) {
    const session = await makeButtfractalSession();
    const remaining = await api.remainingCaloriesForDay(session, date);
    let rollover = remaining < 0 ? 0 : (10 * ((remaining / 10) | 0));
    const nextDay = alterDate(date, 1);
    await setExerciseOfTypeForDate(session, EXERCISE_TYPES.ROLLOVER, nextDay, rollover);
}

export async function setWeightForDate(date, weight) {
    console.log(`We should be setting the weight for ${date} to ${weight} right now!`)
}