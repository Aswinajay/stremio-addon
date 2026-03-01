const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const TORRENTIO_BASE = 'https://torrentio.strem.fun';

const manifest = {
    id: 'com.render.torrent.stream',
    version: '1.0.0',
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

// Parse quality tag from torrent title (e.g. "720p", "1080p", "4K", "2160p")
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

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[Stream Request] type=${type} id=${id}`);

    try {
        // Query Torrentio for available streams
        const torrentioUrl = `${TORRENTIO_BASE}/stream/${type}/${id}.json`;
        console.log(`[Torrentio] Fetching: ${torrentioUrl}`);

        const response = await axios.get(torrentioUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'RenderTorrentStream/1.0',
            },
        });

        const torrentioStreams = response.data?.streams || [];
        console.log(`[Torrentio] Got ${torrentioStreams.length} streams`);

        if (torrentioStreams.length === 0) {
            return { streams: [] };
        }

        const baseUrl = getBaseUrl();

        // Map Torrentio streams to our proxy streams
        const streams = torrentioStreams
            .filter(s => s.infoHash) // Only keep streams with an infoHash
            .map(s => {
                const quality = parseQuality(s.title || s.name);
                const size = parseSize(s.title || s.name);
                const seedInfo = s.title?.match(/👤\s*(\d+)/)?.[1] || '';

                // Build our proxy URL
                let proxyUrl = `${baseUrl}/stream/${s.infoHash}`;
                if (s.fileIdx !== undefined && s.fileIdx !== null) {
                    proxyUrl += `?fileIdx=${s.fileIdx}`;
                }

                // Build a descriptive title
                let title = `🖥️ Render Proxy`;
                if (quality !== '?') title += ` | ${quality}`;
                if (size) title += ` | ${size}`;
                if (seedInfo) title += ` | 👤 ${seedInfo}`;

                // Include source info from Torrentio
                const sourceLine = s.title || s.name || '';

                return {
                    url: proxyUrl,
                    title: `${title}\n${sourceLine}`,
                    behaviorHints: {
                        bingeGroup: `render-torrent-${quality}`,
                        notWebReady: true,
                    },
                };
            })
            .slice(0, 20); // Limit to top 20 streams

        console.log(`[Stream Response] Returning ${streams.length} proxy streams`);
        return { streams };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);

        // If Torrentio fails, return empty (graceful degradation)
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
