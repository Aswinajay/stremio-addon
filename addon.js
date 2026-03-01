const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// Multiple torrent sources for fallback
const TORRENT_SOURCES = [
    {
        name: 'Torrentio',
        url: (type, id) => `https://torrentio.strem.fun/stream/${type}/${id}.json`,
    },
    {
        name: 'Torrentio-Lite',
        url: (type, id) => `https://torrentio.strem.fun/sort=seeders/stream/${type}/${id}.json`,
    },
];

const manifest = {
    id: 'com.render.torrent.stream',
    version: '1.1.0',
    name: 'Render Torrent Stream',
    description: 'Stream movies & series from torrents through Render.com — buffer-free proxy streaming',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Stremio_-_icon.svg/1200px-Stremio_-_icon.svg.png',
    types: ['movie', 'series'],
    resources: ['stream'],
    catalogs: [],
    idPrefixes: ['tt'],
    behaviorHints: {
        configurable: false,
        configurationRequired: false,
    },
};

const builder = new addonBuilder(manifest);

// Determine the base URL for our stream proxy
function getBaseUrl() {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
}

// Parse quality tag from torrent title
function parseQuality(title) {
    if (!title) return '?';
    const match = title.match(/(\d{3,4}p|4K|2160p)/i);
    return match ? match[1].toUpperCase() : '?';
}

// Parse file size from title
function parseSize(title) {
    if (!title) return '';
    const match = title.match(/([\d.]+)\s*(GB|MB)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : '';
}

// Common torrent trackers for magnet links
const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.bittor.pw:1337/announce',
    'udp://public.popcorn-tracker.org:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://exodus.desync.com:6969',
    'udp://open.demonii.com:1337/announce',
];

// Try fetching streams from multiple torrent sources
async function fetchTorrentStreams(type, id) {
    for (const source of TORRENT_SOURCES) {
        try {
            const url = source.url(type, id);
            console.log(`[${source.name}] Fetching: ${url}`);

            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                },
            });

            const streams = response.data?.streams || [];
            console.log(`[${source.name}] Got ${streams.length} streams`);

            if (streams.length > 0) {
                return { streams, source: source.name };
            }
        } catch (err) {
            console.error(`[${source.name}] Failed: ${err.message}`);
            if (err.response) {
                console.error(`[${source.name}] Status: ${err.response.status}`);
                console.error(`[${source.name}] Data: ${JSON.stringify(err.response.data).substring(0, 200)}`);
            }
        }
    }

    return { streams: [], source: 'none' };
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[Stream Request] type=${type} id=${id}`);

    try {
        const { streams: torrentStreams, source } = await fetchTorrentStreams(type, id);

        if (torrentStreams.length === 0) {
            console.log(`[Stream] No streams found from any source`);
            return { streams: [] };
        }

        const baseUrl = getBaseUrl();
        const allStreams = [];

        // Map each torrent to BOTH a native infoHash stream AND an HTTP proxy stream
        const filtered = torrentStreams.filter(s => s.infoHash).slice(0, 15);

        for (const s of filtered) {
            const quality = parseQuality(s.title || s.name);
            const size = parseSize(s.title || s.name);
            const seedInfo = s.title?.match(/👤\s*(\d+)/)?.[1] || '';
            const sourceLine = s.title || s.name || '';

            // Build descriptive parts
            let qualityInfo = '';
            if (quality !== '?') qualityInfo += quality;
            if (size) qualityInfo += ` | ${size}`;
            if (seedInfo) qualityInfo += ` | 👤 ${seedInfo}`;

            // === STREAM 1: HTTP Proxy through Render (buffer-free) ===
            let proxyUrl = `${baseUrl}/stream/${s.infoHash}`;
            if (s.fileIdx !== undefined && s.fileIdx !== null) {
                proxyUrl += `?fileIdx=${s.fileIdx}`;
            }

            allStreams.push({
                url: proxyUrl,
                title: `🖥️ Render Proxy${qualityInfo ? ' | ' + qualityInfo : ''}\n${sourceLine}`,
                behaviorHints: {
                    bingeGroup: `render-proxy-${quality}`,
                    notWebReady: true,
                },
            });

            // === STREAM 2: Native torrent (Stremio's built-in client) ===
            const nativeStream = {
                infoHash: s.infoHash,
                title: `🧲 Direct Torrent${qualityInfo ? ' | ' + qualityInfo : ''}\n${sourceLine}`,
                behaviorHints: {
                    bingeGroup: `render-native-${quality}`,
                },
            };

            // Add fileIdx if present
            if (s.fileIdx !== undefined && s.fileIdx !== null) {
                nativeStream.fileIdx = s.fileIdx;
            }

            // Add sources/trackers
            if (s.sources) {
                nativeStream.sources = s.sources;
            } else {
                nativeStream.sources = TRACKERS.map(t => `tracker:${t}`);
            }

            allStreams.push(nativeStream);
        }

        console.log(`[Stream Response] Returning ${allStreams.length} streams (${filtered.length} proxy + ${filtered.length} native) from ${source}`);
        return { streams: allStreams };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        console.error(err.stack);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
