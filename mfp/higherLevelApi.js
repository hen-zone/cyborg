import {textBetween} from './util';
import * as baseApi from './baseApi';

var DATE_SHAPE = /\d\d\d\d-\d\d-\d\d/;
var EXERCISE_INSTANCE = /<div class="exercise-description">.+?<\/tr>/gm;

function validateDate(date) {
    if (! DATE_SHAPE.test(date)) {
        throw new Error(`Invalid date: ${date}. Dates need to be YYYY-MM-DD.`);
    }
}

export function exerciseInstancesFromPage(page) {
    const textInstances = page.replace(/\s+/gm, ' ').match(EXERCISE_INSTANCE);
    if (! textInstances) return [];
    return textInstances.map(instance => {
        const id = + textBetween('showEditExercise(', ',', instance);
        const name = textBetween(/href="#">\s*/, /\s*<\/a>/, instance);
        const calories = + textBetween(/<\/div>\s*<\/td>\s*<td>\s*\d+\s*<\/td>\s*<td>\s*/, /\s*<\/td>/, instance);
        return {id, name, calories}
    });
}

export function exerciseForNameFromPage(page, name) {
    return exerciseInstancesFromPage(page).filter(it => it.name === name)[0];
}


export async function modifyExercise(session, exerciseId, calories) {
    return await baseApi.post(session, `exercise/edit_entry/${exerciseId}`,
        {'exercise_entry[calories]': calories});
}

export async function exercisePageForDay(session, date) {
    validateDate(date);
    return await baseApi.get(session, `exercise/diary/${session.username}?date=${date}`);
}

export async function cloneExercise(session, fromDate, toDate) {
    validateDate(toDate);
    validateDate(fromDate);
    var cloneUrl = `exercise/copy_workout?date=${toDate}&from_date=${fromDate}&type=0&username=${session.username}`;

    return await baseApi.get(session, cloneUrl);
}