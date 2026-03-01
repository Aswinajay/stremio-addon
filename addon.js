const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── API Mirrors ─────────────────────────────────────────
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
];
const EZTV_BASE = 'https://eztvx.to';
const TPB_API = 'https://apibay.org';
// ─── Manifest ────────────────────────────────────────────
const manifest = {
    id: 'com.render.torrent.stream',
    version: '2.2.0',
    name: 'Render Torrent Stream',
    description: 'Stream movies, series & anime from 15+ sources (1337x, RARBG, TorrentGalaxy, YTS, TPB+, Comet, Nyaa) — 100% buffer-free',
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
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
    return `http://localhost:${process.env.PORT || 3000}`;
}

function formatSize(bytes) {
    if (!bytes) return '';
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(num) || num <= 0) return '';
    const gb = num / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(num / (1024 ** 2)).toFixed(0)} MB`;
}

function parseQuality(title) {
    if (!title) return '?';
    const m = title.match(/(2160p|4K|1080p|720p|480p|HDRip|BDRip|WEB-?DL|WEB-?Rip|BluRay|HDTV)/i);
    return m ? m[1].toUpperCase() : '?';
}

const axiosOpts = {
    timeout: 12000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    },
};

// ─── Cinemeta: get title metadata ────────────────────────
const metaCache = {};
async function getMeta(imdbId, type = 'movie') {
    if (metaCache[imdbId]) return metaCache[imdbId];
    try {
        const r = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { timeout: 8000 });
        const meta = r.data?.meta;
        if (meta?.name) {
            const result = { name: meta.name, year: meta.year || meta.releaseInfo };
            metaCache[imdbId] = result;
            return result;
        }
    } catch (e) { /* ignore */ }
    return null;
}

// ═══════════════════════════════════════════════════════════
// ───  MOVIE SOURCES  ── (6 sources for movies)
// ═══════════════════════════════════════════════════════════

// 1. YTS IMDB Lookup (best quality, cloud-friendly ✅)
async function ytsImdbLookup(imdbId) {
    for (const mirror of YTS_MIRRORS) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=${imdbId}`;
            const r = await axios.get(url, axiosOpts);
            const movie = r.data?.data?.movie;
            if (movie?.torrents?.length > 0) {
                console.log(`[YTS-IMDB] ✓ ${movie.torrents.length} torrents`);
                return movie.torrents.map(t => ({
                    hash: t.hash?.toLowerCase(),
                    title: movie.title_long || movie.title,
                    quality: t.quality,
                    codec: t.video_codec,
                    audio: t.audio_channels,
                    size: t.size || formatSize(t.size_bytes),
                    seeds: t.seeds || 0,
                    source: 'YTS',
                })).filter(t => t.hash);
            }
        } catch (e) { console.error(`[YTS-IMDB] ${mirror}: ${e.message}`); }
    }
    return [];
}

// 2. YTS Title Search (fallback for newer movies, cloud-friendly ✅)
async function ytsSearch(title, year) {
    try {
        const url = `${YTS_MIRRORS[0]}/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}&limit=10&sort_by=seeds`;
        const r = await axios.get(url, axiosOpts);
        const movies = r.data?.data?.movies;
        if (!movies?.length) return [];

        // Find best year match
        let best = movies[0];
        if (year) {
            const match = movies.find(m => String(m.year) === String(year));
            if (match) best = match;
        }

        if (!best.torrents?.length) return [];
        console.log(`[YTS-Search] ✓ "${best.title}" (${best.year}) — ${best.torrents.length} torrents`);
        return best.torrents.map(t => ({
            hash: t.hash?.toLowerCase(),
            title: best.title_long || best.title,
            quality: t.quality,
            codec: t.video_codec,
            audio: t.audio_channels,
            size: t.size || formatSize(t.size_bytes),
            seeds: t.seeds || 0,
            source: 'YTS',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[YTS-Search] ${e.message}`); return []; }
}

// 3. TPB Movie Search (blocked on some clouds ⚠️)
async function tpbMovieSearch(title, year) {
    try {
        const q = year ? `${title} ${year}` : title;
        const url = `${TPB_API}/q.php?q=${encodeURIComponent(q)}&cat=201`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const results = (r.data || []).filter(t =>
            t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
            t.name !== 'No results returned'
        );
        if (!results.length) return [];

        results.sort((a, b) => parseInt(b.seeders || 0) - parseInt(a.seeders || 0));
        console.log(`[TPB-Movie] ✓ ${results.length} results`);
        return results.slice(0, 10).map(r => ({
            hash: r.info_hash?.toLowerCase(),
            title: r.name,
            size: formatSize(r.size),
            seeds: parseInt(r.seeders) || 0,
            source: 'TPB',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[TPB-Movie] ${e.message}`); return []; }
}

// 4. TPB HD Movie Search (category 207 for HD)
async function tpbHDMovieSearch(title, year) {
    try {
        const q = year ? `${title} ${year}` : title;
        const url = `${TPB_API}/q.php?q=${encodeURIComponent(q)}&cat=207`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const results = (r.data || []).filter(t =>
            t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
            t.name !== 'No results returned'
        );
        if (!results.length) return [];

        results.sort((a, b) => parseInt(b.seeders || 0) - parseInt(a.seeders || 0));
        console.log(`[TPB-HD] ✓ ${results.length} HD results`);
        return results.slice(0, 10).map(r => ({
            hash: r.info_hash?.toLowerCase(),
            title: r.name,
            size: formatSize(r.size),
            seeds: parseInt(r.seeders) || 0,
            source: 'TPB-HD',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[TPB-HD] ${e.message}`); return []; }
}

// ═══════════════════════════════════════════════════════════
// ───  META SOURCES (Torrentio as scraper)
// ═══════════════════════════════════════════════════════════

// 5. TorrentsDB Proxy (Torrentio fork, scrapes 1337x, RARBG, etc. No cloudflare block)
async function fetchTorrentio(type, id) {
    try {
        // Use TorrentsDB directly, it has the same stream catalog as Torrentio but no Cloudflare block
        const url = `https://torrentsdb.com/stream/${type}/${id}.json`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const streams = r.data?.streams || [];
        if (!streams.length) return [];

        console.log(`[TorrentsDB] ✓ ${streams.length} streams for ${id}`);
        return streams.map(s => {
            const lines = s.title ? s.title.split('\n') : [];
            const qualityMatch = s.name?.match(/(?:Torrentio|TorrentsDB)\s+(.+)/i);
            const quality = qualityMatch ? qualityMatch[1] : '?';

            // Extract size and seeds from title if possible
            let size = '';
            let seeds = 0;
            const sizeMatch = s.title?.match(/💾\s*([^👥]+)/);
            if (sizeMatch) size = sizeMatch[1].trim();
            const seedsMatch = s.title?.match(/👤\s*(\d+)/);
            if (seedsMatch) seeds = parseInt(seedsMatch[1]);

            const title = lines.length > 2 ? lines[2].trim() : lines.join(' ');
            const source = lines.length > 0 ? `TorrentsDB ${lines[0].trim()}` : 'TorrentsDB';

            return {
                hash: s.infoHash?.toLowerCase(),
                title: title,
                quality: quality,
                size: size,
                seeds: seeds,
                source: source,
            };
        }).filter(t => t.hash);
    } catch (e) {
        console.error(`[TorrentsDB Error] ${e.message}`);
        return [];
    }
}

// 6. Generic Stremio Addon Fetcher (Proxy to TPB+, Comet, etc)
async function fetchStremioAddon(sourceName, baseUrl, type, id) {
    try {
        const url = `${baseUrl}/stream/${type}/${id}.json`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const streams = r.data?.streams || [];
        if (!streams.length) return [];

        console.log(`[${sourceName}] ✓ ${streams.length} streams`);
        return streams.map(s => {
            const quality = parseQuality(s.name + ' ' + s.title);
            let seeds = 0;
            const seedsMatch = s.title?.match(/👤\s*(\d+)/i) || s.name?.match(/👤\s*(\d+)/i);
            if (seedsMatch) seeds = parseInt(seedsMatch[1]);

            let size = '';
            const sizeMatch = s.title?.match(/💾\s*([^👥\n]+)/) || s.name?.match(/💾\s*([^👥\n]+)/);
            if (sizeMatch) size = sizeMatch[1].trim();

            const title = s.title?.split('\n')[0] || s.name || sourceName;

            return {
                hash: s.infoHash?.toLowerCase(),
                title: title,
                quality: quality,
                size: size,
                seeds: seeds,
                source: sourceName,
            };
        }).filter(t => t.hash);
    } catch (e) {
        console.error(`[${sourceName} Error] ${e.message}`);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════
// ───  SERIES SOURCES  ── (3 sources for series)
// ═══════════════════════════════════════════════════════════

// 5. EZTV Episode Lookup (blocked on some clouds ⚠️)
async function eztvSearch(imdbId, season, episode) {
    try {
        const cleanId = imdbId.replace(/^tt/, '');
        const url = `${EZTV_BASE}/api/get-torrents?imdb_id=${cleanId}&limit=100`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const all = r.data?.torrents || [];
        const filtered = all.filter(t =>
            String(t.season) === String(season) && String(t.episode) === String(episode)
        );
        if (!filtered.length) return [];

        console.log(`[EZTV] ✓ ${filtered.length}/${all.length} for S${season}E${episode}`);
        return filtered.map(t => ({
            hash: t.hash?.toLowerCase(),
            title: t.title || t.filename || '',
            size: formatSize(t.size_bytes),
            seeds: t.seeds || 0,
            source: 'EZTV',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[EZTV] ${e.message}`); return []; }
}

// 6. TPB TV Search (blocked on some clouds ⚠️)
async function tpbSeriesSearch(showName, season, episode) {
    try {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const q = `${showName} S${s}E${e}`;
        const url = `${TPB_API}/q.php?q=${encodeURIComponent(q)}&cat=0`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const results = (r.data || []).filter(t =>
            t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
            t.name !== 'No results returned'
        );
        if (!results.length) return [];

        results.sort((a, b) => parseInt(b.seeders || 0) - parseInt(a.seeders || 0));
        console.log(`[TPB-TV] ✓ ${results.length} results for "${q}"`);
        return results.slice(0, 15).map(r => ({
            hash: r.info_hash?.toLowerCase(),
            title: r.name,
            size: formatSize(r.size),
            seeds: parseInt(r.seeders) || 0,
            source: 'TPB',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[TPB-TV] ${e.message}`); return []; }
}

// 7. TPB HD TV Search (category 208)
async function tpbHDSeriesSearch(showName, season, episode) {
    try {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        const q = `${showName} S${s}E${e}`;
        const url = `${TPB_API}/q.php?q=${encodeURIComponent(q)}&cat=208`;
        const r = await axios.get(url, { ...axiosOpts, timeout: 8000 });
        const results = (r.data || []).filter(t =>
            t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
            t.name !== 'No results returned'
        );
        if (!results.length) return [];

        results.sort((a, b) => parseInt(b.seeders || 0) - parseInt(a.seeders || 0));
        console.log(`[TPB-HDTV] ✓ ${results.length} HD results`);
        return results.slice(0, 10).map(r => ({
            hash: r.info_hash?.toLowerCase(),
            title: r.name,
            size: formatSize(r.size),
            seeds: parseInt(r.seeders) || 0,
            source: 'TPB-HD',
        })).filter(t => t.hash);
    } catch (e) { console.error(`[TPB-HDTV] ${e.message}`); return []; }
}

// ─── Dedup + Build Streams ───────────────────────────────
const QUALITY_RANKS = {
    '2160P': 6,
    '4K': 6,
    '1080P': 5,
    '720P': 4,
    '480P': 3,
    'HDRIP': 2,
    'BDRIP': 2,
    'WEBRIP': 2,
    'WEB-DL': 2,
    'BLURAY': 2,
    'HDTV': 2,
    '?': 1
};

function getQualityRank(qualityStr) {
    if (!qualityStr) return 1;
    const q = qualityStr.toUpperCase();
    for (const [key, rank] of Object.entries(QUALITY_RANKS)) {
        if (q.includes(key)) return rank;
    }
    return 1;
}

function buildStreams(torrents, baseUrl) {
    const streams = [];
    const seen = new Set();

    // Sort by resolution (highest first), then seeders (most first)
    torrents.sort((a, b) => {
        const qA = a.quality || parseQuality(a.title);
        const qB = b.quality || parseQuality(b.title);
        const rankA = getQualityRank(qA);
        const rankB = getQualityRank(qB);

        if (rankA !== rankB) {
            return rankB - rankA;
        }
        return (b.seeds || 0) - (a.seeds || 0);
    });

    for (const t of torrents) {
        if (!t.hash || seen.has(t.hash)) continue;
        seen.add(t.hash);

        const quality = t.quality || parseQuality(t.title);
        let info = quality;
        if (t.codec) info += ` ${t.codec}`;
        if (t.audio) info += ` ${t.audio}ch`;
        if (t.size) info += ` | ${t.size}`;
        info += ` | 👤 ${t.seeds}`;

        // Render Proxy (HTTP stream)
        streams.push({
            url: `${baseUrl}/stream/${t.hash}`,
            title: `🖥️ Render Proxy | ${info}\n${t.title} | ${t.source}`,
            behaviorHints: {
                bingeGroup: `render-proxy-${quality}`,
                notWebReady: true,
            },
        });
    }

    return streams;
}

// ─── Stream Handler ──────────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n[Stream] type=${type} id=${id}`);
    const baseUrl = getBaseUrl();

    try {
        if (type === 'movie') {
            const allTorrents = [];

            // Source 1: YTS IMDB lookup (fastest, cloud-friendly)
            const ytsTorrents = await ytsImdbLookup(id);
            allTorrents.push(...ytsTorrents);

            // Source 2: If IMDB failed, try YTS title search
            if (allTorrents.length === 0) {
                const meta = await getMeta(id, 'movie');
                if (meta?.name) {
                    const ytsSearch$ = await ytsSearch(meta.name, meta.year);
                    allTorrents.push(...ytsSearch$);

                    // Source 3-10: Meta-Scraper Fetch (Parallel)
                    const metaScrapers = [
                        fetchTorrentio('movie', id),
                        fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', 'movie', id),
                        fetchStremioAddon('Comet', 'https://comet.elfhosted.com/indexers=torrentio', 'movie', id),
                        fetchStremioAddon('MediaFusion', 'https://mediafusion.elfhosted.com/indexers=torrentio', 'movie', id),
                    ];

                    const extra = await Promise.allSettled([
                        tpbMovieSearch(meta.name, meta.year),
                        tpbHDMovieSearch(meta.name, meta.year),
                        ...metaScrapers
                    ]);

                    extra.forEach(s => {
                        if (s.status === 'fulfilled') allTorrents.push(...s.value);
                    });
                }
            } else {
                // YTS worked, still try everything else for more options
                const meta = await getMeta(id, 'movie');
                if (meta?.name) {
                    try {
                        const metaScrapers = [
                            fetchTorrentio('movie', id),
                            fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', 'movie', id),
                            fetchStremioAddon('Comet', 'https://comet.elfhosted.com/indexers=torrentio', 'movie', id),
                        ];
                        const extra = await Promise.allSettled([
                            tpbMovieSearch(meta.name, meta.year),
                            tpbHDMovieSearch(meta.name, meta.year),
                            ...metaScrapers
                        ]);
                        extra.forEach(s => {
                            if (s.status === 'fulfilled') allTorrents.push(...s.value);
                        });
                    } catch (e) { /* ignore */ }
                }
            }

            if (allTorrents.length === 0) {
                console.log('[Stream] No movie torrents found from any source');
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] → ${streams.length} movie streams (${allTorrents.length} unique torrents)`);
            return { streams };

        } else if (type === 'series') {
            const [imdbId, season, episode] = id.split(':');
            if (!imdbId || !season || !episode) return { streams: [] };

            const meta = await getMeta(imdbId, 'series');
            const showName = meta?.name;

            // Query ALL series sources in parallel for maximum speed
            const sources = await Promise.allSettled([
                eztvSearch(imdbId, season, episode),
                fetchTorrentio('series', id),
                fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', 'series', id),
                fetchStremioAddon('Comet', 'https://comet.elfhosted.com/indexers=torrentio', 'series', id),
                fetchStremioAddon('MediaFusion', 'https://mediafusion.elfhosted.com/indexers=torrentio', 'series', id),
                showName ? tpbSeriesSearch(showName, season, episode) : Promise.resolve([]),
                showName ? tpbHDSeriesSearch(showName, season, episode) : Promise.resolve([]),
            ]);

            const allTorrents = [];
            for (const s of sources) {
                if (s.status === 'fulfilled' && s.value.length > 0) {
                    allTorrents.push(...s.value);
                }
            }

            if (allTorrents.length === 0) {
                console.log(`[Stream] No series torrents found for ${showName || imdbId} S${season}E${episode}`);
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] → ${streams.length} series streams (${allTorrents.length} unique torrents)`);
            return { streams };
        }

        return { streams: [] };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
