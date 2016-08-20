export function textBetween(starter, ender, corpus) {
    return ((corpus || '').split(starter)[1] || '').split(ender)[0];
}

export function validateSession(session) {
    if (! session || typeof session.jar !== 'object' || typeof session.username !== 'string'
        || typeof session.token !== 'string') throw new Error('Invalid session object.')
}

var DATE_SHAPE = /\d\d\d\d-\d\d-\d\d/;

export function validateDate(date) {
    if (! DATE_SHAPE.test(date)) {
        throw new Error(`Invalid date: ${date}. Dates need to be YYYY-MM-DD.`);
    }
}

export function alterDate(date, days) {
    var advanced = new Date(date);
    advanced.setDate(advanced.getDate() + days);
    return advanced.toISOString().split('T')[0];
}