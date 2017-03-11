import SpotifyWebApi from "spotify-web-api-node";
import * as MemCache from "./memcached";


let SPOTIFY_CLIENT_ID = 'fb91152cd5fd475d9878399c2cb0c6cb';
let SPOTIFY_CLIENT_SECRET = '5b3e94fa7a6e473b86015bdd9320595d';
let SPOTIFY_REDIRECT_URI = 'http://localhost:3000/';

const HEN_SPOTIFY = '1232511708';




export const SPOTIFY_RECEIVE_CREDS_PATH = '/spotify/receive-creds';

export function makeSpotifyRedirectUri(req) {
    const port = req.get('port');
    return `${req.protocol}://${req.get('host')}${port ? ':' + port : ''}${SPOTIFY_RECEIVE_CREDS_PATH}`;
}


export async function getSpotifyHistory() {
    const encodedHistory = await MemCache.get('spotify-history');
    return new Set(JSON.parse(encodedHistory));
}

async function addToSpotifyHistory(ids) {
    const historySet = await getSpotifyHistory();
    ids.forEach(it => historySet.add(it));
    const reEncodedHistory = JSON.stringify(Array.from(historySet));
    return await MemCache.set('spotify-history', reEncodedHistory);
}

export async function cutPipe(req) {
    const spotifyApi = await makeSpotifyClient(req);

    const pipeDream = await getPagedPlaylist(spotifyApi, HEN_SPOTIFY, PIPE_DREAM_PLAYLIST);
    console.log('loaded pipedream');
    const randomTracks = pipeDream.length > 30 ? getRandomItems(pipeDream, 30) : pipeDream;


    const lastPipeNumber = Number(await MemCache.get('spotify-pipe-number') || 0);
    const nextPipeNumber = lastPipeNumber + 1;
    await MemCache.set('spotify-pipe-number', String(nextPipeNumber));

    let name = `Pyro Pipe #${nextPipeNumber}`;
    console.log('about to create playlist');
    const playlistInfo = await spotifyApi.createPlaylist(HEN_SPOTIFY, name);
    console.log('created playlist');
    const newPlaylistId = playlistInfo.body.id;
    console.log(randomTracks);
    await spotifyApi.addTracksToPlaylist(HEN_SPOTIFY, newPlaylistId, randomTracks);
    await spotifyApi.removeTracksFromPlaylist(HEN_SPOTIFY, PIPE_DREAM_PLAYLIST, randomTracks.map(uri => ({uri})));


    return {name: name, id: newPlaylistId, uri: playlistInfo.body.uri, tracks: randomTracks};
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

    let confirmationSong = await authedSpotifyApi.getMySavedTracks({limit: 1});
    return confirmationSong;
}

export async function scanInboxes(req) {
    const spotifyApi = await makeSpotifyClient(req);
    const history = await getSpotifyHistory();

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
        ['pyroFaves', '1232511708', '3ALEQUBsfYKggO5ZULf8xN'],
        ['henShazamTracks', '1232511708', '1JBCsNUmAdZw4xIkZOW90r'],
    ];


    const actualPlaylists = await Promise.all(inboxPlaylistSpecs.map(async spec => {
        return [spec[0], await getPagedPlaylist(spotifyApi, spec[1], spec[2])];
    }));

    let allNewTracks = [];
    let totalScanned = 0;

    actualPlaylists.forEach(pair => {
        const [name, tracks] = pair;
        tracks.forEach(uri => {
            if (!history.has(uri)) allNewTracks.push(uri);
            ++totalScanned;
        })
    });

    console.log(`Scanned ${totalScanned} tracks; found ${allNewTracks.length} new ones.`);

    await inParallelBatches(70, allNewTracks, async(batch) => {
        console.log(`about to add ${batch.length} tracks to pipe dream...:`, batch);
        await spotifyApi.addTracksToPlaylist(
            HEN_SPOTIFY,
            PIPE_DREAM_PLAYLIST,
            batch,
        );
        console.log(`about to add ${batch.length} tracks to history...`);
        await addToSpotifyHistory(batch);
    });

    await inParallelBatches(70, actualPlaylists[0][1], async them => {
        console.log(`about to remove ${them.length} tracks from inbox...`);
        await spotifyApi.removeTracksFromPlaylist(HEN_SPOTIFY, INBOX_PLAYLIST, them.map(uri => ({uri})));
    });

    let totalFavesFound = 0;
    await Promise.all(favePlaylistSpecs.map(async spec => {
        const [playlistName, userName, playlistId] = spec;
        const tracks = await getPagedPlaylist(spotifyApi, userName, playlistId);
        if (tracks.length) {
            await spotifyApi.addToMySavedTracks(tracks.map(it => it.split(':').reverse()[0]));
        }
        totalFavesFound += tracks.length;
    }));
    return { allNewTracks, totalScanned, totalFavesFound };
}



