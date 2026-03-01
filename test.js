const { addonInterface } = require('./addon');

async function test() {
    try {
        const req = { type: 'movie', id: 'tt0111161' };
        console.log("Requesting:", req);
        const result = await addonInterface.request('stream', req);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Failed:", e);
    }
}
test();
