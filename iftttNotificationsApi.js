import request from 'request-promise';

export async function sendNotification(message) {
    return await request({
        method: 'POST',
        url: 'https://maker.ifttt.com/trigger/notify/with/key/dAE1Go00wodZ6QANr-kHtv',
        formData: {
            value1: message
        }
    });
}