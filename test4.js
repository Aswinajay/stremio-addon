const { addonBuilder } = require('stremio-addon-sdk');

const manifest = {
    id: 'com.test.catalog',
    version: '1.0.0',
    name: 'Test Catalog',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [{ type: 'movie', id: 'top' }]
};
const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(args => {
    console.log("Called with:", args);
    return Promise.resolve({ metas: [{ id: "tt123", type: "movie", name: "Test" }] });
});

const intf = builder.getInterface();
intf.request('catalog', { type: 'movie', id: 'top' })
    .then(console.log)
    .catch(console.error);
