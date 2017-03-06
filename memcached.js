import MemJS from 'memjs';

//noinspection JSUnresolvedVariable
const memCacheClient = MemJS.Client.create(process.env.REDIS_URL);



async function promisifyCall(expr) {
    return await new Promise((ok, bad) => {
        expr((error, value) => {
            if (error) {
                bad(error);
            } else {
                ok(value);
            }
        });
    });
}

export async function get(key) {
    let buffer = await promisifyCall(callback => memCacheClient.get(key, callback));
    return buffer && buffer.toString();
}


export async function set(key, value) {
    return await promisifyCall(callback => memCacheClient.set(key, value, callback));
}
