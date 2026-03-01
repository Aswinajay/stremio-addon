const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const TorrentSearchApi = require('torrent-search-api');

// ─── Enable torrent providers ────────────────────────────
TorrentSearchApi.enableProvider('1337x');
TorrentSearchApi.enableProvider('ThePirateBay');

// ─── API Endpoints ───────────────────────────────────────
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
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
    version: '1.3.0',
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

// ─── Get show name from Cinemeta for better search ───────
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
        console.error(`[Cinemeta] Failed to get name for ${imdbId}: ${err.message}`);
    }
    return null;
}

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
            };
        } catch (err) {
            console.error(`[YTS] ${mirror} failed: ${err.message}`);
        }
    }
    return null;
}

// ─── EZTV: Fetch Series Torrents ─────────────────────────
async function fetchSeriesFromEZTV(imdbId, season, episode) {
    try {
        const cleanId = imdbId.replace(/^tt/, '');
        const url = `${EZTV_BASE}/api/get-torrents?imdb_id=${cleanId}&limit=100`;
        console.log(`[EZTV] Fetching: ${url}`);

        const response = await axios.get(url, axiosOpts);
        const allTorrents = response.data?.torrents || [];

        const episodeTorrents = allTorrents.filter(t =>
            String(t.season) === String(season) && String(t.episode) === String(episode)
        );

        console.log(`[EZTV] Found ${episodeTorrents.length} torrents for S${season}E${episode}`);
        return episodeTorrents.map(t => ({
            hash: t.hash,
            title: t.title || t.filename || '',
            size: formatSize(parseInt(t.size_bytes) || 0),
            seeds: t.seeds || 0,
            source: 'EZTV',
        }));
    } catch (err) {
        console.error(`[EZTV] Failed: ${err.message}`);
        return [];
    }
}

// ─── 1337x/TPB: Search Series Torrents ───────────────────
function extractHashFromMagnet(magnet) {
    if (!magnet) return null;
    const match = magnet.match(/btih:([a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : null;
}

async function fetchSeriesFromSearch(showName, season, episode) {
    try {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const query = `${showName} S${s}E${e}`;
        console.log(`[Search] Searching: "${query}"`);

        const results = await TorrentSearchApi.search(query, 'TV', 20);
        console.log(`[Search] Got ${results.length} results`);

        const torrents = [];
        for (const r of results.slice(0, 10)) {
            try {
                const magnet = await TorrentSearchApi.getMagnet(r);
                const hash = extractHashFromMagnet(magnet);
                if (hash) {
                    torrents.push({
                        hash,
                        title: r.title || query,
                        size: r.size || '',
                        seeds: parseInt(r.seeds) || 0,
                        source: r.provider || '1337x',
                    });
                }
            } catch (magnetErr) {
                // Skip if we can't get magnet
            }
        }
        console.log(`[Search] Extracted ${torrents.length} valid torrents`);
        return torrents;
    } catch (err) {
        console.error(`[Search] Failed: ${err.message}`);
        return [];
    }
}

// ─── Build stream objects ────────────────────────────────
function buildStreams(torrents, baseUrl) {
    const allStreams = [];

    for (const t of torrents) {
        const hash = t.hash;
        if (!hash) continue;

        // Quality detection
        let quality = '?';
        const qMatch = (t.title || '').match(/(\d{3,4}p|4K|2160p)/i);
        if (qMatch) quality = qMatch[1].toUpperCase();

        let info = `${quality}`;
        if (t.size) info += ` | ${t.size}`;
        info += ` | 👤 ${t.seeds}`;

        // HTTP Proxy stream
        allStreams.push({
            url: `${baseUrl}/stream/${hash.toLowerCase()}`,
            title: `🖥️ Render Proxy | ${info}\n${t.title} | ${t.source}`,
            behaviorHints: {
                bingeGroup: `render-proxy-${quality}`,
                notWebReady: true,
            },
        });

        // Native torrent stream (fallback)
        allStreams.push({
            infoHash: hash.toLowerCase(),
            title: `🧲 Direct Torrent | ${info}\n${t.title} | ${t.source}`,
            sources: TRACKERS.map(tr => `tracker:${tr}`),
            behaviorHints: {
                bingeGroup: `render-native-${quality}`,
            },
        });
    }

    return allStreams;
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

            const torrents = result.torrents.map(t => ({
                hash: t.hash,
                title: `${result.title}`,
                size: t.size || formatSize(t.size_bytes),
                seeds: t.seeds || 0,
                source: 'YTS',
                quality: t.quality,
                codec: t.video_codec,
                audio: t.audio_channels,
            }));

            // Custom info for YTS movies (has structured quality data)
            const allStreams = [];
            for (const t of torrents) {
                if (!t.hash) continue;

                let info = `${t.quality || '?'}`;
                if (t.codec) info += ` ${t.codec}`;
                if (t.audio) info += ` ${t.audio}ch`;
                if (t.size) info += ` | ${t.size}`;
                info += ` | 👤 ${t.seeds}`;

                allStreams.push({
                    url: `${baseUrl}/stream/${t.hash.toLowerCase()}`,
                    title: `🖥️ Render Proxy | ${info}\n${t.title} | YTS`,
                    behaviorHints: {
                        bingeGroup: `render-proxy-${t.quality}`,
                        notWebReady: true,
                    },
                });

                allStreams.push({
                    infoHash: t.hash.toLowerCase(),
                    title: `🧲 Direct Torrent | ${info}\n${t.title} | YTS`,
                    sources: TRACKERS.map(tr => `tracker:${tr}`),
                    behaviorHints: {
                        bingeGroup: `render-native-${t.quality}`,
                    },
                });
            }

            console.log(`[Stream Response] Returning ${allStreams.length} movie streams`);
            return { streams: allStreams };

        } else if (type === 'series') {
            const [imdbId, season, episode] = id.split(':');

            if (!imdbId || !season || !episode) {
                console.log(`[Stream] Invalid series ID format: ${id}`);
                return { streams: [] };
            }

            // Try EZTV first, then fall back to search
            let torrents = await fetchSeriesFromEZTV(imdbId, season, episode);

            if (torrents.length === 0) {
                // EZTV failed or blocked — use search via 1337x/TPB
                const showName = await getShowName(imdbId);
                if (showName) {
                    torrents = await fetchSeriesFromSearch(showName, season, episode);
                } else {
                    console.log(`[Stream] Could not get show name for ${imdbId}`);
                }
            }

            if (torrents.length === 0) {
                console.log('[Stream] No series torrents found');
                return { streams: [] };
            }

            const allStreams = buildStreams(torrents, baseUrl);
            console.log(`[Stream Response] Returning ${allStreams.length} series streams`);
            return { streams: allStreams };
        }

        return { streams: [] };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        console.error(err.stack);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
