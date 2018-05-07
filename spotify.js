import SpotifyWebApi from "spotify-web-api-node";
<<<<<<< HEAD
// import * as MemCache from "./memcached";
import Knex from "knex";

const MemCache = new Map();
=======
import * as MemCache from "./memcached";
import Knex from "knex";
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c

function getTrackInfo() {
    const client = new SpotifyWebApi();
}

import hardCodedHistoryURIs from "./spotify-ancient-history.json";

const SPOTIFY_CLIENT_ID = "fb91152cd5fd475d9878399c2cb0c6cb";
const SPOTIFY_CLIENT_SECRET = "5b3e94fa7a6e473b86015bdd9320595d";

const HEN_SPOTIFY = "1232511708";

//noinspection JSUnresolvedVariable
const dbClient = Knex({
    client: "pg",
<<<<<<< HEAD
    connection: process.env.DATABASE_URL + "?ssl=true",
=======
    connection: process.env.DATABASE_URL + "?ssl=true"
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
});

const SPOTIFY_TABLE = "SpotifyTracks";
const getSpotifyTable = () => dbClient(SPOTIFY_TABLE);

async function createTableSpotifyTracks(dbClient) {
    // Can't run this every time bc the index clause makes it fail ;__;
    console.log("about to create table...");
    await dbClient.schema.createTableIfNotExists(SPOTIFY_TABLE, table => {
        table.increments();
        table.string("uri").index().unique();
        table.bool("dispensed").notNullable().defaultTo(false);
    });
    console.log("Created table!");
}

export const SPOTIFY_RECEIVE_CREDS_PATH = "/spotify/receive-creds";

export function makeSpotifyRedirectUri(req) {
    const port = req.get("port");
    return `${req.protocol}://${req.get("host")}${port ? ":" + port : ""}${SPOTIFY_RECEIVE_CREDS_PATH}`;
}

async function incrementPipeNumber() {
    const nextPipeNumber = Number(
        (await MemCache.get("spotify-pipe-number")) || 0
    ) + 1;
    await MemCache.set("spotify-pipe-number", String(nextPipeNumber));
    return nextPipeNumber;
}

function orderByString(list, predicate) {
    const orderables = list.map(it => [predicate(it), it]);
    orderables.sort();
    return orderables.map(it => it[1]);
}

function shuffled(list) {
    const output = [...list];
    for (let i = output.length; i; i--) {
        const j = Math.floor(Math.random() * i);
        const mover = output[i - 1];
        output[i - 1] = output[j];
        output[j] = mover;
    }
    return output;
}

export async function cutPipe(req) {
    const spotifyApi = await makeSpotifyClient(req);

    const pipeDream = await getSpotifyTable()
        .select("uri", "added")
        .where({ dispensed: false });

    const ordered = orderByString(pipeDream, it => it.added).reverse();

    const newestTracks = ordered.slice(0, 300);
    const olderTracks = ordered.slice(300);

    const olderMidPoint = Math.floor(olderTracks.length / 2);

    const mediumTracks = olderTracks.slice(0, olderMidPoint);
    const oldestTracks = olderTracks.slice(olderMidPoint);

    let THIRD_SIZE = 10;

    const newPlaylistRows = getRandomItems(newestTracks, THIRD_SIZE);
    const mediumPlaylistRows = getRandomItems(mediumTracks, THIRD_SIZE);
    const oldPlaylistRows = getRandomItems(oldestTracks, THIRD_SIZE);

    const playlistRows = shuffled(
        newPlaylistRows.concat(oldPlaylistRows).concat(mediumPlaylistRows)
    );

    const playlistURIs = playlistRows.map(it => it.uri);

    const numRemaining = pipeDream.length - playlistURIs.length;

    const nextPipeNumber = await incrementPipeNumber();

    let name = `Pyro Pack #${nextPipeNumber}`;
    console.log("about to create playlist");
    const playlistInfo = await spotifyApi.createPlaylist(HEN_SPOTIFY, name);
    console.log("created playlist");
    const newPlaylistId = playlistInfo.body.id;
    console.log(playlistURIs);
    await spotifyApi.addTracksToPlaylist(
        HEN_SPOTIFY,
        newPlaylistId,
        playlistURIs
    );
    await getSpotifyTable()
        .whereIn("uri", playlistURIs)
        .update({ dispensed: true });

    return {
        name: name,
        numRemaining,
        id: newPlaylistId,
        uri: playlistInfo.body.uri,
        tracks: playlistRows
    };
}

async function asyncTry(block, handler) {
    let result;
    try {
        result = await block();
    } catch (it) {
        result = await handler(it);
    }
    return result;
}

async function saveAccessCode(value) {
    return await MemCache.set("spotify-access-code", value);
}

async function saveRefreshCode(value) {
    return await MemCache.set("spotify-refresh-code", value);
}

let rawSpotifyClient = function(req) {
    return new SpotifyWebApi({
        clientId: SPOTIFY_CLIENT_ID,
        clientSecret: SPOTIFY_CLIENT_SECRET,
        redirectUri: makeSpotifyRedirectUri(req)
    });
};

export async function makeSpotifyClient(req) {
    console.log("Instantiating SpotifyWebApi");
<<<<<<< HEAD
    const setup = {
        clientId: SPOTIFY_CLIENT_ID,
        clientSecret: SPOTIFY_CLIENT_SECRET,
        redirectUri: makeSpotifyRedirectUri(req),
        refreshToken: await MemCache.get("spotify-refresh-code"),
    };

    console.log("setup =", setup);
    const spotifyApi = new SpotifyWebApi(setup);
    console.log("instantiated library");
=======
    const spotifyApi = rawSpotifyClient(req);
    console.log("Loading refresh token from memcache");
    let refreshToken = await MemCache.get("spotify-refresh-code");
    console.log("Setting refresh token " + refreshToken);

    spotifyApi.setRefreshToken(refreshToken);
    console.log("Refreshing access token");
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
    const refreshAccessTokenResult = await spotifyApi.refreshAccessToken();
    console.log("done calling refreshAccessToken");
    spotifyApi.setAccessToken(refreshAccessTokenResult.body.access_token);
    return spotifyApi;
}

const INBOX_PLAYLIST = "7LbKQZYipf8CfqH2eWoz5Q";
const limit = 100;

export async function getPagedPlaylist(spotifyApi, userId, playlistId) {
    const firstPage = await getSinglePlaylistPage(
        spotifyApi,
        userId,
        playlistId,
        0
    );
    const numPages = Math.ceil(firstPage.total / 100);
    const pagePromises = [Promise.resolve(firstPage)];
    for (let i = 1; i < numPages; ++i) {
        pagePromises.push(
            getSinglePlaylistPage(spotifyApi, userId, playlistId, i * 100)
        );
    }
    const resolvedPages = await Promise.all(pagePromises);
    return [].concat.apply([], resolvedPages.map(it => it.uris));
}

export async function getPagedPlaylistWithTrackInfo(
    spotifyApi,
    userId,
    playlistId
) {
    const firstPage = await getSinglePlaylistPageWithTrackInfo(
        spotifyApi,
        userId,
        playlistId,
        0
    );
    const numPages = Math.ceil(firstPage.total / 100);
    const pagePromises = [Promise.resolve(firstPage)];
    for (let i = 1; i < numPages; ++i) {
        pagePromises.push(
            getSinglePlaylistPageWithTrackInfo(
                spotifyApi,
                userId,
                playlistId,
                i * 100
            )
        );
    }
    const resolvedPages = await Promise.all(pagePromises);
    return [].concat.apply([], resolvedPages.map(it => it.tracks));
}

async function getSinglePlaylistPage(
    spotifyApi,
    userId,
    playlistId,
    offset = 0
) {
    // console.log(`loading playlist ${userId}/${playlistId} at #${offset}`);
    const rawPage = await spotifyApi.getPlaylistTracks(userId, playlistId, {
        fields: "total,items(track(uri))",
        offset,
        limit
    });
    let nextOffset = offset + limit;
    let total = rawPage.body.total;
    const moreNeeded = nextOffset < total;
    const uris = rawPage.body.items
        .map(it => it.track.uri)
        .filter(uri => uri !== "spotify:track:null");
    return { total, uris };
}

async function getSinglePlaylistPageWithTrackInfo(
    spotifyApi,
    userId,
    playlistId,
    offset = 0
) {
    // console.log(`loading playlist ${userId}/${playlistId} at #${offset}`);
    const rawPage = await spotifyApi.getPlaylistTracks(userId, playlistId, {
<<<<<<< HEAD
        fields: "total,items(track(uri,duration_ms,name,artists,album))",
=======
        fields: "total,items(track(uri,duration_ms,name,artists))",
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
        offset,
        limit
    });
    let nextOffset = offset + limit;
    let total = rawPage.body.total;
    const moreNeeded = nextOffset < total;
    const tracks = rawPage.body.items
        .map(it => it.track)
        .filter(it => it.uri !== "spotify:track:null");
    return { total, tracks };
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
    if (arr.length <= n) return arr.slice();
    var result = new Array(n), len = arr.length, taken = new Array(len);
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
    console.log("making spotify client");
    const preAuthSpotifyApi = await rawSpotifyClient(req);

    console.log("Trading auth code for tokens");
    const granted = await preAuthSpotifyApi.authorizationCodeGrant(
        req.query.code
    );

    console.log("Tokens acquired");

    saveAccessCode(granted.body["access_token"]);
    saveRefreshCode(granted.body["refresh_token"]);

    console.log("creating authed client");
    const authedSpotifyApi = await makeSpotifyClient(req);

    console.log("Requesting saved tracks from authed client");

    return await authedSpotifyApi.getMySavedTracks({ limit: 1 });
}

async function addTracks(uris, options = {}) {
    return await getSpotifyTable().insert(
        uris.map(uri => ({ uri, added: Date.now(), ...options }))
    );
}

export async function scanInboxes(req) {
    const spotifyApi = await makeSpotifyClient(req);

    const inboxPlaylistSpecs = [
        ["henDiscover", "spotify", "37i9dQZEVXcORpwpJL9ceh"],
        ["henReleaseRadar", "spotify", "37i9dQZEVXbnh6TOylu0xX"],
        ["djoDiscover", "spotify", "37i9dQZEVXcNPxeqxshEf9"],
        // ['desmondDiscover', 'spotify', '37i9dQZEVXcISf3FIRhvUD'],
        ["pitchforkOfficialTracks", "pitchfork", "7q503YgioHAbo1iOIa67M8"],
        ["pitchforkUnofficialAlbums", "kenove", "6QdRN6dPnook9KPezrggaO"],
        // ['jjjHitList', 'triple.j.abc', '7vFQNWXoblEJXpbnTuyz76'],
        ["needleDropTracks", "szymonczarnowski", "1h9vpwvGP5Pr2qvAzNCjOK"],
<<<<<<< HEAD
        ["rtrSoundAlternative", "rtrfm92.1", "0uHa4xTycG89LOehnKIgyS"],
=======
        ["rtrSoundAlternative", "rtrfm92.1", "0uHa4xTycG89LOehnKIgyS"]
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
        // ['livvyDiscover', 'spotify', '37i9dQZEVXcJP0NgDg2X0T'],
        // ['pitchforkUnofficialTracks', 'szymonczarnowski', '2LkZTDKWPelJv7HNY9rQV7'],
        // ['izaakDiscover', 'spotify', '37i9dQZEVXcDc5DQak61yg'],
        // ['izaakRadar', 'spotify', '37i9dQZEVXbe7LBY0sEzoU'],
        // ['djoRadar', 'spotify', '37i9dQZEVXbwEaUu0bjFU6'],
    ];

    const favePlaylistSpecs = [
        ["pyroFaves", HEN_SPOTIFY, "3ALEQUBsfYKggO5ZULf8xN"],
<<<<<<< HEAD
        ["henShazamTracks", HEN_SPOTIFY, "1JBCsNUmAdZw4xIkZOW90r"],
=======
        ["henShazamTracks", HEN_SPOTIFY, "1JBCsNUmAdZw4xIkZOW90r"]
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
    ];

    // We use a set here to deduplicate overlaps between the source playlists
    const allInboxTrackSet = new Set();
    let myInboxTracks = [];

    await Promise.all([
        (async () => {
            console.log("loading inbox...");
            const tracks = await getPagedPlaylist(
                spotifyApi,
                HEN_SPOTIFY,
                INBOX_PLAYLIST
            );
            tracks.forEach(it => allInboxTrackSet.add(it));
            myInboxTracks.push(...tracks);
            console.log("...inbox loaded");
        })(),

        Promise.all(
            inboxPlaylistSpecs.map(async spec => {
                const [nickname, user, id] = spec;
                console.log("Loading playlist " + nickname);
                const tracks = await asyncTry(
                    () => getPagedPlaylist(spotifyApi, user, id),
                    error => {
                        console.error("Got error loading playlist " + nickname);
                        throw error;
                    }
                );
                tracks.forEach(it => allInboxTrackSet.add(it));
                console.log("Done loading " + nickname);
            })
        )
    ]);

    console.log("Loaded all new-track sources");

    const historyURIsFromDB = (await getSpotifyTable().select("uri")).map(
        it => it.uri
    );

    const historySet = new Set([
        ...historyURIsFromDB,
<<<<<<< HEAD
        ...hardCodedHistoryURIs.map(it => it.uri),
=======
        ...hardCodedHistoryURIs.map(it => it.uri)
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
    ]);
    const newTracks = Array.from(allInboxTrackSet).filter(
        it => !historySet.has(it)
    );

    // There is a race condition here, but it will fail atomically. if one of these tracks
    // gets added to history before we write it, this write will fail, but we can just run the whole
    // endpoint again, and nothing will have been mutated.
    if (newTracks.length) {
        await addTracks(newTracks, { dispensed: false });
    }
    console.log("About to delete imported tracks from the inbox");
    // delete tracks from inbox.
    await inParallelBatches(70, myInboxTracks, async subset => {
        const tracks = subset.map(uri => ({ uri }));
        await spotifyApi.removeTracksFromPlaylist(
            HEN_SPOTIFY,
            INBOX_PLAYLIST,
            tracks
        );
    });

    console.log("Done deleting imported tracks from the inbox");

    console.log("About to process all fave-sources");
    let totalFavesFound = 0;
    await Promise.all(
        favePlaylistSpecs.map(async spec => {
            const [playlistName, userName, playlistId] = spec;
            console.log(`Processing fave-source ${playlistName}`);
            const tracks = await getPagedPlaylist(
                spotifyApi,
                userName,
                playlistId
            );
            console.log(
                `Fully loaded playlist ${playlistName}. There weree ${tracks.length} tracks.`
            );
            if (tracks.length) {
                console.log(
                    `About to add to saved tracks from playlist ${playlistName}`
                );

                await inParallelBatches(50, tracks, async subset => {
                    const subsetTrackIds = subset.map(
                        it => it.split(":").reverse()[0]
                    );
                    // console.log('subsetTrackIds', subsetTrackIds);
                    console.log(
                        `Saving ${subset.length} tracks from ${playlistName}`
                    );
                    await spotifyApi.addToMySavedTracks(subsetTrackIds);
                    console.log(
                        `Done saving ${subset.length} tracks from ${playlistName}`
                    );
                });

                console.log(
                    `Done adding saved tracks from playlist ${playlistName}`
                );

                console.log(`About to clear  ${playlistName}`);

                await inParallelBatches(70, tracks, async subset => {
                    await spotifyApi.removeTracksFromPlaylist(
                        userName,
                        playlistId,
                        subset.map(uri => ({ uri }))
                    );
                });

                console.log(`Done clearing ${playlistName}`);
            }
            console.log(`Done processing fave-source ${playlistName}`);

            totalFavesFound += tracks.length;
        })
    );

    console.log("Done processing all fave-sources;");

    // TODO: save the faves as already-dispensed tracks in the history
    // TODO: and, if they are already in history, update them to be marked as dispensed
    // TODO: clear the faves playlists here

<<<<<<< HEAD
    return {
        numNewInboxTracks: newTracks.length,
        possibleNewFaves: totalFavesFound,
=======
    console.log("here come the dyump:");
    const allTracks = await getSpotifyTable();

    const dumpFileName = process.cwd() + "/dump-" + Date.now() + ".json";

    fs.writeFileSync(dumpFileName, JSON.stringify(allTracks));

    return {
        numNewInboxTracks: newTracks.length,
        possibleNewFaves: totalFavesFound
>>>>>>> c763c2eb26a2d26bb8f11a8b1c6744925db3da7c
    };
}

import fs from "fs";
