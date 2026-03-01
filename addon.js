const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
    id: 'com.render.torrentstream',
    version: '1.0.0',
    name: 'Render Torrent Stream',
    description: 'Streams torrents through Render.com servers to avoid local P2P buffering.',
    logo: 'https://cdn-icons-png.flaticon.com/512/888/888874.png',
    resources: ['stream', 'catalog'],
    types: ['movie'],
    idPrefixes: ['tt'],
    catalogs: [
        {
            type: 'movie',
            id: 'top',
            name: 'Render Top Movies'
        }
    ]
};

const builder = new addonBuilder(manifest);

let currentHost = 'http://localhost:3000';

const setHost = (host) => {
    currentHost = host;
};

builder.defineStreamHandler(async ({ type, id }) => {
    console.log('[addon] stream request for type:', type, 'id:', id);

    if (type !== 'movie' || !id.startsWith('tt')) {
        return Promise.resolve({ streams: [] });
    }

    try {
        const response = await axios.get(`https://torrentio.strem.fun/stream/${type}/${id}.json`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 15000
        });
        const data = response.data;

        if (!data || !data.streams || data.streams.length === 0) {
            console.log('[addon] No torrents found for', id);
            return Promise.resolve({ streams: [] });
        }

        // Limit to top 15 streams to avoid overwhelming the Render proxy list
        const torrents = data.streams.slice(0, 15);

        const streams = torrents.map(torrent => {
            const infoHash = torrent.infoHash;
            // Provide a fallback title just in case
            const streamTitle = torrent.title || `Render Stream - ${infoHash.substring(0, 6)}`;
            return {
                name: "Render",
                title: streamTitle,
                url: `${currentHost}/stream/${infoHash}`,
                behaviorHints: {
                    notWebReady: true,
                }
            };
        }).filter(stream => stream.url.includes('/stream/undefined') === false);

        return Promise.resolve({ streams });
    } catch (err) {
        console.error('[addon] Error fetching Torrentio data:', err.message);
        return Promise.resolve({ streams: [] });
    }
});

builder.defineCatalogHandler(async ({ type, id }) => {
    console.log('[addon] catalog request:', type, id);
    if (type === 'movie' && id === 'top') {
        try {
            // Forward Cinemeta's top movies so the addon's home board populates with items
            const res = await axios.get('https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json', { timeout: 10000 });
            return { metas: res.data.metas || [] };
        } catch (e) {
            console.error('[addon] Catalog fetch failed', e.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

module.exports = {
    addonInterface: builder.getInterface(),
    setHost
};
