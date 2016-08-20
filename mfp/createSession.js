import request from "request-promise";
import {textBetween} from "./util";

const headers = {
    'User-Agent': 'curl/7.43.0',
    'Accept': '*/*'
};

const LOGGED_IN_PATTTERN = /\/blog\/([^"]+)/;

function assertLoggedIn(loginResultBody, username) {
    const loggedInEvidence = loginResultBody.match(LOGGED_IN_PATTTERN);
    if (!loggedInEvidence || loggedInEvidence[1] !== username) {
        throw new Error(`User ${username} is not logged in; the result page did not contain the username as expected.`);
    }
}
export default async function createSession(username, password) {
    const jar = request.jar();

    const loginResultBody = (await request({
        method: 'POST',
        uri: `https://www.myfitnesspal.com/account/login`,
        headers,
        gzip: true,
        followAllRedirects: true,
        jar,
        formData: {username, password}
    }));

    assertLoggedIn(loginResultBody, username);

    const token = parseAuthToken(loginResultBody);

    return {token, jar, username};
}

function parseAuthToken(checkinPageBody) {
    return textBetween('authenticity_token" type="hidden" value="', '"', checkinPageBody);
}