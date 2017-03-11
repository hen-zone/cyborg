import SpotifyWebApi from "spotify-web-api-node";
import * as MemCache from "./memcached";
import Knex from 'knex';


const SPOTIFY_CLIENT_ID = 'fb91152cd5fd475d9878399c2cb0c6cb';
const SPOTIFY_CLIENT_SECRET = '5b3e94fa7a6e473b86015bdd9320595d';

const HEN_SPOTIFY = '1232511708';

//noinspection JSUnresolvedVariable
const dbClient = Knex({
    client: 'pg',
    connection: process.env.DATABASE_URL + '?ssl=true'
});

const SPOTIFY_TABLE = 'SpotifyTracks';
const getSpotifyTable = () => dbClient(SPOTIFY_TABLE);

async function createTableSpotifyTracks(dbClient) {
    // Can't run this every time bc the index clause makes it fail ;__;
    console.log ('about to create table...');
    await dbClient.schema.createTableIfNotExists(SPOTIFY_TABLE, table => {
        table.increments();
        table.string('uri').index().unique();
        table.bool('dispensed').notNullable().defaultTo(false);
    });
    console.log ('Created table!');
}

export const SPOTIFY_RECEIVE_CREDS_PATH = '/spotify/receive-creds';

export function makeSpotifyRedirectUri(req) {
    const port = req.get('port');
    return `${req.protocol}://${req.get('host')}${port ? ':' + port : ''}${SPOTIFY_RECEIVE_CREDS_PATH}`;
}


export async function getSpotifyHistory() {
    return await getSpotifyTable().select()
}

async function incrementPipeNumber() {
    const nextPipeNumber = Number(await MemCache.get('spotify-pipe-number') || 0) + 1;
    await MemCache.set('spotify-pipe-number', String(nextPipeNumber));
    return nextPipeNumber;
}
export async function cutPipe(req) {
    const spotifyApi = await makeSpotifyClient(req);

    const pipeDream = await getSpotifyTable().select('uri').where({dispensed: false});

    // pipeDream is a list of URIs.
    // we should select all undispensed tracks from the DB, then get random entries, then map them to their URIs.
    let PIPE_SIZE = 30;
    const playlistRows = pipeDream.length > PIPE_SIZE ? getRandomItems(pipeDream, PIPE_SIZE) : pipeDream;
    const playlistURIs = playlistRows.map(it => it.uri);

    const numRemaining = pipeDream.length - playlistURIs.length;


    const nextPipeNumber = await incrementPipeNumber();

    let name = `Pyro Pipe #${nextPipeNumber}`;
    console.log('about to create playlist');
    const playlistInfo = await spotifyApi.createPlaylist(HEN_SPOTIFY, name);
    console.log('created playlist');
    const newPlaylistId = playlistInfo.body.id;
    console.log(playlistURIs);
    await spotifyApi.addTracksToPlaylist(HEN_SPOTIFY, newPlaylistId, playlistURIs);
    await getSpotifyTable().whereIn('uri', playlistURIs).update({dispensed: true});


    return {
        name: name,
        numRemaining,
        id: newPlaylistId,
        uri: playlistInfo.body.uri,
        tracks: playlistRows,
    };
}


async function saveAccessCode(value) {
    return await MemCache.set('spotify-access-code', value);
}

async function saveRefreshCode(value) {
    return await MemCache.set('spotify-refresh-code', value);
}

async function makeSpotifyClient(req) {
    const spotifyApi = new SpotifyWebApi({
        clientId: SPOTIFY_CLIENT_ID,
        clientSecret: SPOTIFY_CLIENT_SECRET,
        redirectUri: makeSpotifyRedirectUri(req),
    });

    spotifyApi.setRefreshToken(await MemCache.get('spotify-refresh-code'));
    const refreshAccessTokenResult = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(refreshAccessTokenResult.body.access_token);
    return spotifyApi;
}

const HISTORY_PLAYLIST = '0ly7f5t0ylwWIiW1wAtvHc';
const INBOX_PLAYLIST = '7LbKQZYipf8CfqH2eWoz5Q';
const PIPE_DREAM_PLAYLIST = '08vL7ksqd4ovzUb7AAcJi9';
const limit = 100;

async function getPagedPlaylist(spotifyApi, userId, playlistId) {
    const firstPage = await getSinglePlaylistPage(spotifyApi, userId, playlistId, 0);
    const numPages = Math.ceil(firstPage.total / 100);
    const pagePromises = [Promise.resolve(firstPage)];
    for (let i = 1; i < numPages; ++i) {
        pagePromises.push(getSinglePlaylistPage(spotifyApi, userId, playlistId, i * 100));
    }
    const resolvedPages = await Promise.all(pagePromises);
    return [].concat.apply([], resolvedPages.map(it => it.uris));
}

async function getSinglePlaylistPage(spotifyApi, userId, playlistId, offset=0) {
    console.log(`loading playlist ${userId}/${playlistId} at #${offset}`);
    const rawPage = await spotifyApi.getPlaylistTracks(
        userId,
        playlistId,
        { fields: "total,items(track(uri))", offset, limit },
    );
    let nextOffset = offset + limit;
    let total = rawPage.body.total;
    const moreNeeded = nextOffset < total;
    const uris = rawPage.body.items.map(it => it.track.uri).filter(uri => uri !== 'spotify:track:null');
    return { total, uris }
}

async function inParallelBatches(limit, list, asyncProcess) {
    let remaining = [...list];
    let tasks = [];
    while (remaining.length) {
        const subset = remaining.slice(0, limit);
        remaining = remaining.slice(limit);
        tasks.push(asyncProcess(subset));
    }
    return await Promise.all(tasks);
}


function randomIntBetweenInclusive(first, last) {
    return first + Math.floor(Math.random() * (last - first + 1));
}

function getRandomItems(arr, n) {
    var result = new Array(n),
        len = arr.length,
        taken = new Array(len);
    if (n > len)
        throw new RangeError("getRandom: more elements taken than available");
    while (n--) {
        var x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len;
    }
    return result;
}

export async function receiveSpotifyCreds(req) {
    const preAuthSpotifyApi = await makeSpotifyClient(req);

    const granted = await preAuthSpotifyApi.authorizationCodeGrant(req.query.code);

    saveAccessCode(granted.body['access_token']);
    saveRefreshCode(granted.body['refresh_token']);

    const authedSpotifyApi = await makeSpotifyClient(req);

    return await authedSpotifyApi.getMySavedTracks({limit: 1});
}

export async function scanInboxes(req) {
    const spotifyApi = await makeSpotifyClient(req);

    const inboxPlaylistSpecs = [
        ['inbox', HEN_SPOTIFY, INBOX_PLAYLIST],
        ['henDiscover', 'spotify', '37i9dQZEVXcORpwpJL9ceh'],
        ['henReleaseRadar', 'spotify', '37i9dQZEVXbbXNiJeLtLv3'],
        ['djoDiscover', 'spotify', '37i9dQZEVXcNPxeqxshEf9'],
        ['livvyDiscover', 'spotify', '37i9dQZEVXcJP0NgDg2X0T'],
        ['desmondDiscover', 'spotify', '37i9dQZEVXcISf3FIRhvUD'],
        ['pitchforkOfficialTracks', 'pitchfork', '7q503YgioHAbo1iOIa67M8'],
        ['pitchforkUnofficialAlbums', 'kenove', '6QdRN6dPnook9KPezrggaO'],
        ['jjjHitList', 'triple.j.abc', '7vFQNWXoblEJXpbnTuyz76'],
        ['pitchforkUnofficialTracks', 'szymonczarnowski', '2LkZTDKWPelJv7HNY9rQV7'],
        // ['izaakDiscover', 'spotify', '37i9dQZEVXcDc5DQak61yg'],
        // ['izaakRadar', 'spotify', '37i9dQZEVXbe7LBY0sEzoU'],
        // ['djoRadar', 'spotify', '37i9dQZEVXbwEaUu0bjFU6'],
    ];

    const favePlaylistSpecs = [
        ['pyroFaves', HEN_SPOTIFY, '3ALEQUBsfYKggO5ZULf8xN'],
        ['henShazamTracks', HEN_SPOTIFY, '1JBCsNUmAdZw4xIkZOW90r'],
    ];

    const inboxTrackSet = new Set();

    await Promise.all(inboxPlaylistSpecs.map(async spec => {
        const [nickname, user, id] = spec;
        let tracks = await getPagedPlaylist(spotifyApi, user, id);
        tracks.forEach(it => inboxTrackSet.add(it));
    }));

    const allHistoryURIs = (await getSpotifyTable().select('uri')).map(it => it.uri);

    const historySet = new Set(allHistoryURIs);
    const newTracks = Array.from(inboxTrackSet).filter(it => ! historySet.has(it));

    // There is a race condition here, but it will fail atomically. if one of these tracks
    // gets added to history before we write it, this write will fail, but we can just run the whole
    // endpoint again, and nothing will have been mutated.
    if (newTracks.length) {
        await getSpotifyTable().insert(newTracks.map(uri => ({uri, dispensed: false})));
    }

    // TODO: clear my inbox here.

    let totalFavesFound = 0;
    await Promise.all(favePlaylistSpecs.map(async spec => {
        const [playlistName, userName, playlistId] = spec;
        const tracks = await getPagedPlaylist(spotifyApi, userName, playlistId);
        if (tracks.length) {
            await spotifyApi.addToMySavedTracks(tracks.map(it => it.split(':').reverse()[0]));
        }
        totalFavesFound += tracks.length;
    }));

    // TODO: save the faves as already-dispensed tracks in the history
    // TODO: and, if they already in history, update them to be marked as dispensed
    // TODO: clear the faves playlists here

    return { numNewInboxTracks: newTracks.length, possibleNewFaves: totalFavesFound };
}



