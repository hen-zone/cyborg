import MemJS from 'memjs';

//noinspection JSUnresolvedVariable

console.log('process.env:', process.env);

const memCacheClient = MemJS.Client.create();
console.log('created memcached client with url: ');

console.log('attempting to write!');
memCacheClient.set('startupTime', String(Date.now()), (err, result) => {
    console.log('setter callback invoked.');
    console.log('    - err:', err);
    console.log('    - result:', result);
});

console.log('attempting to read!');
memCacheClient.get('startupTime', (err, result) => {
    console.log('getter callback invoked.');
    console.log('    - err:', err);
    console.log('    - result:', result);
});




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
