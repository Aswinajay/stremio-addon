const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── API Endpoints ───────────────────────────────────────
// YTS has multiple mirrors; we try several
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
    'https://yts.autos',
];

const EZTV_BASE = 'https://eztvx.to';

// ─── Trackers ────────────────────────────────────────────
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

// ─── Manifest ────────────────────────────────────────────
const manifest = {
    id: 'com.render.torrent.stream',
    version: '1.2.0',
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

// ─── Helpers ─────────────────────────────────────────────
function getBaseUrl() {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
}

function formatSize(bytes) {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
}

const axiosOpts = {
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    },
};

// ─── YTS: Fetch Movie Torrents ───────────────────────────
async function fetchMovieTorrents(imdbId) {
    for (const mirror of YTS_MIRRORS) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=${imdbId}`;
            console.log(`[YTS] Trying: ${url}`);

            const response = await axios.get(url, axiosOpts);
            const movie = response.data?.data?.movie;

            if (!movie || !movie.torrents || movie.torrents.length === 0) {
                console.log(`[YTS] No torrents from ${mirror}`);
                continue;
            }

            console.log(`[YTS] Got ${movie.torrents.length} torrents from ${mirror}`);
            return {
                title: movie.title_long || movie.title,
                torrents: movie.torrents,
                source: mirror,
            };
        } catch (err) {
            console.error(`[YTS] ${mirror} failed: ${err.message}`);
        }
    }
    return null;
}

// ─── EZTV: Fetch Series Torrents ─────────────────────────
async function fetchSeriesEpisodeTorrents(imdbId, season, episode) {
    try {
        // EZTV wants the IMDB ID without 'tt' prefix
        const cleanId = imdbId.replace(/^tt/, '');
        const url = `${EZTV_BASE}/api/get-torrents?imdb_id=${cleanId}&limit=100`;
        console.log(`[EZTV] Fetching: ${url}`);

        const response = await axios.get(url, axiosOpts);
        const allTorrents = response.data?.torrents || [];
        console.log(`[EZTV] Got ${allTorrents.length} total torrents for show`);

        // Filter for the specific season and episode
        const episodeTorrents = allTorrents.filter(t => {
            return String(t.season) === String(season) && String(t.episode) === String(episode);
        });

        console.log(`[EZTV] Found ${episodeTorrents.length} torrents for S${season}E${episode}`);
        return episodeTorrents;
    } catch (err) {
        console.error(`[EZTV] Failed: ${err.message}`);
        return [];
    }
}

// ─── Stream Handler ──────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n[Stream Request] type=${type} id=${id}`);
    const baseUrl = getBaseUrl();
    const allStreams = [];

    try {
        if (type === 'movie') {
            // ── Movies: use YTS API ──
            const result = await fetchMovieTorrents(id);

            if (!result || result.torrents.length === 0) {
                console.log('[Stream] No movie torrents found');
                return { streams: [] };
            }

            for (const t of result.torrents) {
                const hash = t.hash;
                if (!hash) continue;

                const quality = t.quality || '?';
                const size = t.size || formatSize(t.size_bytes);
                const seeds = t.seeds || 0;
                const codec = t.video_codec || '';
                const audioChannels = t.audio_channels || '';

                // Info line
                let info = `${quality}`;
                if (codec) info += ` ${codec}`;
                if (audioChannels) info += ` ${audioChannels}ch`;
                if (size) info += ` | ${size}`;
                info += ` | 👤 ${seeds}`;

                // HTTP Proxy stream
                const proxyUrl = `${baseUrl}/stream/${hash.toLowerCase()}`;
                allStreams.push({
                    url: proxyUrl,
                    title: `🖥️ Render Proxy | ${info}\n${result.title} | YTS`,
                    behaviorHints: {
                        bingeGroup: `render-proxy-${quality}`,
                        notWebReady: true,
                    },
                });

                // Native torrent stream (fallback)
                allStreams.push({
                    infoHash: hash.toLowerCase(),
                    title: `🧲 Direct Torrent | ${info}\n${result.title} | YTS`,
                    sources: TRACKERS.map(t => `tracker:${t}`),
                    behaviorHints: {
                        bingeGroup: `render-native-${quality}`,
                    },
                });
            }
        } else if (type === 'series') {
            // ── Series: use EZTV API ──
            // Stremio sends series IDs as "tt1234567:season:episode"
            const [imdbId, season, episode] = id.split(':');

            if (!imdbId || !season || !episode) {
                console.log(`[Stream] Invalid series ID format: ${id}`);
                return { streams: [] };
            }

            const torrents = await fetchSeriesEpisodeTorrents(imdbId, season, episode);

            if (torrents.length === 0) {
                console.log('[Stream] No series torrents found');
                return { streams: [] };
            }

            for (const t of torrents) {
                const hash = t.hash;
                if (!hash) continue;

                const size = formatSize(parseInt(t.size_bytes) || 0);
                const seeds = t.seeds || 0;
                const title = t.title || t.filename || '';

                // Try to detect quality from filename
                let quality = '?';
                const qMatch = title.match(/(\d{3,4}p|4K|2160p)/i);
                if (qMatch) quality = qMatch[1].toUpperCase();

                let info = `${quality}`;
                if (size) info += ` | ${size}`;
                info += ` | 👤 ${seeds}`;

                // HTTP Proxy stream
                const proxyUrl = `${baseUrl}/stream/${hash.toLowerCase()}`;
                allStreams.push({
                    url: proxyUrl,
                    title: `🖥️ Render Proxy | ${info}\n${title} | EZTV`,
                    behaviorHints: {
                        bingeGroup: `render-proxy-${quality}`,
                        notWebReady: true,
                    },
                });

                // Native torrent stream (fallback)
                allStreams.push({
                    infoHash: hash.toLowerCase(),
                    title: `🧲 Direct Torrent | ${info}\n${title} | EZTV`,
                    sources: TRACKERS.map(t => `tracker:${t}`),
                    behaviorHints: {
                        bingeGroup: `render-native-${quality}`,
                    },
                });
            }
        }

        console.log(`[Stream Response] Returning ${allStreams.length} streams`);
        return { streams: allStreams };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        console.error(err.stack);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
