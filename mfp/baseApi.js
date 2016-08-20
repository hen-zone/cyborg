import request from 'request-promise';
import {validateSession} from './util';

const headers = {
    'User-Agent': 'curl/7.43.0',
    'Accept': '*/*'
};

async function makeRequest(method, session, path, formData) {
    validateSession(session);
    return await request({
        method,
        uri: `http://www.myfitnesspal.com/${path}`,
        headers,
        gzip: true,
        followAllRedirects: true,
        jar: session.jar,
        formData
    });
}

export async function post(session, path, data={}) {
    return await makeRequest('POST', session, path, {...data, authenticity_token: session.token});
}

export async function get(session, path) {
    return await makeRequest('GET', session, path)
}