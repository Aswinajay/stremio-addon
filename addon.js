const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── API Endpoints ───────────────────────────────────────
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
];

// TPB API — works from cloud IPs!
const TPB_API = 'https://apibay.org';
// TV category = 205, HD TV = 208
const TPB_CATEGORIES = ['205', '208'];

// EZTV as first-try for series (faster when not blocked)
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
    version: '1.4.0',
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
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(num) || num <= 0) return '';
    const gb = num / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = num / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
}

function parseQuality(title) {
    if (!title) return '?';
    const match = title.match(/(\d{3,4}p|4K|2160p)/i);
    return match ? match[1].toUpperCase() : '?';
}

const axiosOpts = {
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    },
};

// ─── Get show name from Cinemeta ─────────────────────────
const nameCache = {};
async function getShowName(imdbId) {
    if (nameCache[imdbId]) return nameCache[imdbId];
    try {
        const url = `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`;
        const r = await axios.get(url, { timeout: 10000 });
        const name = r.data?.meta?.name;
        if (name) {
            nameCache[imdbId] = name;
            return name;
        }
    } catch (err) {
        console.error(`[Cinemeta] Failed: ${err.message}`);
    }
    return null;
}

// ─── YTS: Movies ─────────────────────────────────────────
async function fetchMovieTorrents(imdbId) {
    for (const mirror of YTS_MIRRORS) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=${imdbId}`;
            console.log(`[YTS] Trying: ${url}`);

            const response = await axios.get(url, axiosOpts);
            const movie = response.data?.data?.movie;

            if (!movie || !movie.torrents || movie.torrents.length === 0) {
                continue;
            }

            console.log(`[YTS] Got ${movie.torrents.length} torrents`);
            return {
                title: movie.title_long || movie.title,
                torrents: movie.torrents,
            };
        } catch (err) {
            console.error(`[YTS] ${mirror} failed: ${err.message}`);
        }
    }
    return null;
}

// ─── EZTV: Series (first try) ────────────────────────────
async function fetchSeriesFromEZTV(imdbId, season, episode) {
    try {
        const cleanId = imdbId.replace(/^tt/, '');
        const url = `${EZTV_BASE}/api/get-torrents?imdb_id=${cleanId}&limit=100`;
        console.log(`[EZTV] Fetching: ${url}`);

        const response = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const allTorrents = response.data?.torrents || [];

        const episodeTorrents = allTorrents.filter(t =>
            String(t.season) === String(season) && String(t.episode) === String(episode)
        );

        console.log(`[EZTV] Found ${episodeTorrents.length}/${allTorrents.length} for S${season}E${episode}`);
        return episodeTorrents.map(t => ({
            hash: t.hash?.toLowerCase(),
            title: t.title || t.filename || '',
            size: formatSize(t.size_bytes),
            seeds: t.seeds || 0,
            source: 'EZTV',
        })).filter(t => t.hash);
    } catch (err) {
        console.error(`[EZTV] Failed: ${err.message}`);
        return [];
    }
}

// ─── TPB: Series (fallback — works from cloud!) ──────────
async function fetchSeriesFromTPB(showName, season, episode) {
    try {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const query = `${showName} S${s}E${e}`;
        console.log(`[TPB] Searching: "${query}"`);

        const url = `${TPB_API}/q.php?q=${encodeURIComponent(query)}&cat=0`;
        const response = await axios.get(url, axiosOpts);
        const results = response.data || [];

        // Filter out "no results" placeholder
        const validResults = results.filter(r =>
            r.info_hash && r.info_hash !== '0000000000000000000000000000000000000000' &&
            r.name !== 'No results returned'
        );

        console.log(`[TPB] Got ${validResults.length} results`);

        // Sort by seeders descending
        validResults.sort((a, b) => parseInt(b.seeders || 0) - parseInt(a.seeders || 0));

        return validResults.slice(0, 15).map(r => ({
            hash: r.info_hash?.toLowerCase(),
            title: r.name || query,
            size: formatSize(r.size),
            seeds: parseInt(r.seeders) || 0,
            source: 'TPB',
        })).filter(t => t.hash);
    } catch (err) {
        console.error(`[TPB] Failed: ${err.message}`);
        return [];
    }
}

// ─── Build dual streams (proxy + native) ─────────────────
function buildStreams(torrents, baseUrl) {
    const streams = [];
    const seen = new Set();

    for (const t of torrents) {
        if (!t.hash || seen.has(t.hash)) continue;
        seen.add(t.hash);

        const quality = parseQuality(t.title);
        let info = quality;
        if (t.size) info += ` | ${t.size}`;
        info += ` | 👤 ${t.seeds}`;

        // HTTP Proxy stream (plays through Render)
        streams.push({
            url: `${baseUrl}/stream/${t.hash}`,
            title: `🖥️ Render Proxy | ${info}\n${t.title} | ${t.source}`,
            behaviorHints: {
                bingeGroup: `render-proxy-${quality}`,
                notWebReady: true,
            },
        });

        // Native infoHash stream (plays via Stremio's built-in torrent client)
        streams.push({
            infoHash: t.hash,
            title: `🧲 Direct Torrent | ${info}\n${t.title} | ${t.source}`,
            sources: TRACKERS.map(tr => `tracker:${tr}`),
            behaviorHints: {
                bingeGroup: `render-native-${quality}`,
            },
        });
    }

    return streams;
}

// ─── Stream Handler ──────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n[Stream Request] type=${type} id=${id}`);
    const baseUrl = getBaseUrl();

    try {
        if (type === 'movie') {
            const result = await fetchMovieTorrents(id);
            if (!result || result.torrents.length === 0) {
                console.log('[Stream] No movie torrents found');
                return { streams: [] };
            }

            const streams = [];
            for (const t of result.torrents) {
                if (!t.hash) continue;

                let info = `${t.quality || '?'}`;
                if (t.video_codec) info += ` ${t.video_codec}`;
                if (t.audio_channels) info += ` ${t.audio_channels}ch`;
                const size = t.size || formatSize(t.size_bytes);
                if (size) info += ` | ${size}`;
                info += ` | 👤 ${t.seeds || 0}`;

                streams.push({
                    url: `${baseUrl}/stream/${t.hash.toLowerCase()}`,
                    title: `🖥️ Render Proxy | ${info}\n${result.title} | YTS`,
                    behaviorHints: {
                        bingeGroup: `render-proxy-${t.quality}`,
                        notWebReady: true,
                    },
                });

                streams.push({
                    infoHash: t.hash.toLowerCase(),
                    title: `🧲 Direct Torrent | ${info}\n${result.title} | YTS`,
                    sources: TRACKERS.map(tr => `tracker:${tr}`),
                    behaviorHints: {
                        bingeGroup: `render-native-${t.quality}`,
                    },
                });
            }

            console.log(`[Stream] Returning ${streams.length} movie streams`);
            return { streams };

        } else if (type === 'series') {
            const [imdbId, season, episode] = id.split(':');
            if (!imdbId || !season || !episode) {
                return { streams: [] };
            }

            // Try EZTV first
            let torrents = await fetchSeriesFromEZTV(imdbId, season, episode);

            // If EZTV fails, use TPB API (cloud-friendly!)
            if (torrents.length === 0) {
                const showName = await getShowName(imdbId);
                if (showName) {
                    torrents = await fetchSeriesFromTPB(showName, season, episode);
                } else {
                    console.log(`[Stream] Could not determine show name for ${imdbId}`);
                }
            }

            if (torrents.length === 0) {
                console.log('[Stream] No series torrents found');
                return { streams: [] };
            }

            const streams = buildStreams(torrents, baseUrl);
            console.log(`[Stream] Returning ${streams.length} series streams`);
            return { streams };
        }

        return { streams: [] };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
