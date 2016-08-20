export function textBetween(starter, ender, corpus) {
    return ((corpus || '').split(starter)[1] || '').split(ender)[0];
}

export function validateSession(session) {
    if (! session || typeof session.jar !== 'object' || typeof session.username !== 'string'
        || typeof session.token !== 'string') throw new Error('Invalid session object.')
}