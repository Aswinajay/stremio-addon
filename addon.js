const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── API Mirrors ─────────────────────────────────────────
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
];
const EZTV_MIRRORS = ['https://eztvx.to', 'https://eztv.re', 'https://eztv.wf', 'https://eztv.tf', 'https://eztv1.xyz'];
const TPB_MIRRORS = [
    { url: 'https://apibay.org', type: 'api' },
    { url: 'https://pirateproxy.live', type: 'html' },
    { url: 'https://thepiratebay0.org', type: 'html' },
    { url: 'https://tpbay.win', type: 'html' },
    { url: 'https://tpb.party', type: 'html' }
];
// ─── Manifest ────────────────────────────────────────────
const manifest = {
    id: 'com.render.torrent.stream',
    version: '3.5.17',
    name: 'Render Torrent Stream (Hydra+)',
    description: 'Auto-rotating Scrapers | Multi-Format Series Search | 4K HDR',
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
    const m = title.match(/(2160p|4K|UHD|1080p|720p|480p|CAM|TS|TELESYNC|HDRip|BDRip|WEB-?DL|WEB-?Rip|BluRay|HDTV)/i);
    return m ? m[1].toUpperCase() : '?';
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

function getAxiosOpts() {
    return {
        timeout: 10000,
        maxContentLength: 5 * 1024 * 1024, // 5MB Limit per request to prevent RAM spikes
        headers: {
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            'Accept': 'application/json, text/html',
        }
    };
}

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
            const r = await axios.get(url, getAxiosOpts());
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
        const r = await axios.get(url, getAxiosOpts());
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

// 3. Hydra Scraper: TPB API + HTML Proxy support
async function tpbSearch(q, category = '201,207,208') {
    for (const mirror of TPB_MIRRORS) {
        try {
            const isApi = mirror.type === 'api';
            const url = isApi ? `${mirror.url}/q.php?q=${encodeURIComponent(q)}&cat=${category}` : `${mirror.url}/search/${encodeURIComponent(q)}/1/99/${category}`;
            const r = await axios.get(url, { ...getAxiosOpts(), timeout: 8000 });

            if (isApi) {
                const results = Array.isArray(r.data) ? r.data : [];
                const filtered = results.filter(t => t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000');
                if (!filtered.length) continue;
                console.log(`[TPB-API] ✓ ${filtered.length} results via ${mirror.url}`);
                return filtered.slice(0, 40).map(r => ({
                    hash: r.info_hash?.toLowerCase(),
                    title: r.name,
                    size: formatSize(r.size),
                    seeds: parseInt(r.seeders) || 0,
                    source: 'TPB-API',
                }));
            } else {
                const html = r.data || '';
                const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
                if (!magnets.length) continue;
                console.log(`[TPB-HTML] ✓ ${magnets.length} results via ${mirror.url}`);
                return magnets.slice(0, 30).map(m => ({
                    hash: m.split('btih:')[1].toLowerCase(),
                    title: q,
                    source: 'TPB-Proxy',
                    seeds: 10
                }));
            }
        } catch (e) { continue; }
    }
    return [];
}

// 4. EZTV Search (Mirror Rotation)
async function eztvSearch(imdbId, s, e) {
    if (!imdbId) return [];
    const id = imdbId.replace('tt', '');
    for (const mirror of EZTV_MIRRORS) {
        try {
            const url = `${mirror}/api/get-torrents?imdb_id=${id}`;
            const r = await axios.get(url, getAxiosOpts());
            const torrents = r.data?.torrents || [];
            if (!torrents.length) continue;

            const filtered = torrents.filter(t =>
                String(t.season) === String(parseInt(s)) &&
                String(t.episode) === String(parseInt(e))
            );
            if (!filtered.length) continue;

            console.log(`[EZTV] ✓ ${filtered.length} results via ${mirror}`);
            return filtered.map(t => ({
                hash: t.hash?.toLowerCase(),
                title: t.title,
                size: t.size,
                seeds: t.seeds || 0,
                source: 'EZTV',
            })).filter(t => t.hash);
        } catch (err) { continue; }
    }
    return [];
}

// 4.6 SolidTorrents (Mirror Rotation)
async function solidTorrentsSearch(q) {
    const mirrors = ['https://solidtorrents.to', 'https://solidtorrents.eu', 'https://solidtorrents.net'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/api/v1/search?q=${encodeURIComponent(q)}&category=all`;
            const r = await axios.get(url, { ...getAxiosOpts(), timeout: 8000 });
            const results = r.data?.results || [];
            if (!results.length) continue;
            console.log(`[SolidTorrents] ✓ ${results.length} results via ${mirror}`);
            return results.map(r => ({
                hash: r.infoHash?.toLowerCase(),
                title: r.title,
                size: formatSize(r.size),
                seeds: r.seeders || 0,
                source: 'SolidTorrents',
            })).filter(t => t.hash);
        } catch (e) { continue; }
    }
    return [];
}

// 4.65 BTDig Search (replaces TorrentGalaxy which is DNS-blocked on Render)
async function btDigSearch(q) {
    const mirrors = ['https://btdig.com', 'https://btdigg.xyz'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/search?q=${encodeURIComponent(q)}&p=0&order=0`;
            const r = await axios.get(url, { ...getAxiosOpts(), timeout: 8000, headers: { ...getAxiosOpts().headers, 'User-Agent': 'Mozilla/5.0' } });
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            const hashes = [...new Set(magnets.map(m => m.split('btih:')[1].toLowerCase()))];
            if (!hashes.length) continue;
            console.log(`[BTDig] ✓ ${hashes.length} results via ${mirror}`);
            return hashes.slice(0, 25).map(h => ({ hash: h, title: q, seeds: 1, source: 'BTDig' }));
        } catch (e) { continue; }
    }
    return [];
}

// 4.7 Nyaa RSS Search (Direct Anime Scraper)
async function nyaaRssSearch(q) {
    try {
        const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q)}&c=1_0&f=0`;
        const r = await axios.get(url, { ...getAxiosOpts(), timeout: 8000 });
        const items = r.data.match(/<item>[\s\S]*?<\/item>/g) || [];
        if (!items.length) return [];

        console.log(`[Nyaa-RSS] ✓ ${items.length} titles found for ${q}`);
        return items.map(item => {
            const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'Unknown';
            const hash = item.match(/<nyaa:infoHash>([\s\S]*?)<\/nyaa:infoHash>/)?.[1]?.toLowerCase();
            const size = item.match(/<nyaa:size>([\s\S]*?)<\/nyaa:size>/)?.[1] || '';
            const seeds = item.match(/<nyaa:seeders>([\s\S]*?)<\/nyaa:seeders>/)?.[1] || '0';
            return { hash, title, size, seeds: parseInt(seeds), source: 'Nyaa' };
        }).filter(t => t.hash);
    } catch (e) { return []; }
}

// 4.8 Bitsearch Direct Scraper
async function bitsearchSearch(q) {
    try {
        const url = `https://bitsearch.to/search?q=${encodeURIComponent(q)}`;
        const r = await axios.get(url, { ...getAxiosOpts(), timeout: 10000 });
        const html = r.data || '';

        // Find magnets in HTML (Base32 or Hex)
        const magnets = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/gi) || [];
        const hashes = magnets.map(m => m.split('btih:')[1].toLowerCase());

        if (!hashes.length) return [];
        console.log(`[Bitsearch] ✓ ${hashes.length} hashes found for ${q}`);

        return [...new Set(hashes)].slice(0, 25).map(h => ({
            hash: h,
            title: `${q} - Bitsearch`,
            source: 'Bitsearch',
            seeds: 5, // Estimate
        }));
    } catch (e) { return []; }
}

// 4.5 TPB IMDB Lookup (Powerful for Indian & Niche content)
async function tpbImdbLookup(imdbId) {
    for (const mirror of TPB_MIRRORS) {
        try {
            if (mirror.type !== 'api') continue; // Only API supports direct IMDB query reliably
            const url = `${mirror.url}/q.php?q=${imdbId}&cat=0`;
            const r = await axios.get(url, getAxiosOpts());
            const results = (r.data || []).filter(t =>
                t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
                t.name !== 'No results returned'
            );
            if (!results.length) continue;

            console.log(`[TPB-IMDB] ✓ ${results.length} results via ${mirror.url}`);
            return results.map(r => ({
                hash: r.info_hash?.toLowerCase(),
                title: r.name,
                size: formatSize(r.size),
                seeds: parseInt(r.seeders) || 0,
                source: 'TPB-Direct',
            })).filter(t => t.hash);
        } catch (e) { continue; }
    }
    return [];
}

// ═══════════════════════════════════════════════════════════
// ───  META SOURCES (Torrentio as scraper)
// ═══════════════════════════════════════════════════════════

// 5. Torrentio Scraper (Primary source for 1337x, RARBG, TorrentGalaxy, etc)
async function fetchTorrentio(type, id) {
    // Try Official Torrentio first, then TorrentsDB mirror
    const baseUrls = [
        'https://torrentio.strem.fun',
        'https://torrentsdb.com',
        'https://torrentio.viren070.me'
    ];

    for (const baseUrl of baseUrls) {
        try {
            const url = `${baseUrl}/stream/${type}/${id}.json`;
            const r = await axios.get(url, { ...getAxiosOpts(), timeout: 6000 });
            const streams = r.data?.streams || [];
            if (!streams.length) continue;

            console.log(`[Torrentio-${baseUrl.includes('strem.fun') ? 'Official' : 'Mirror'}] ✓ ${streams.length} streams`);
            return streams.map(s => {
                const lines = s.title ? s.title.split('\n') : [];
                const qualityMatch = s.name?.match(/(?:Torrentio|TorrentsDB)\s+(.+)/i);
                const quality = qualityMatch ? qualityMatch[1] : '?';

                let size = '';
                let seeds = 0;
                const sizeMatch = s.title?.match(/💾\s*([^👥👤\n]+)/);
                if (sizeMatch) size = sizeMatch[1].trim();
                const seedsMatch = s.title?.match(/[👤👥]\s*(\d+)/);
                if (seedsMatch) seeds = parseInt(seedsMatch[1]);

                const title = lines.length > 2 ? lines[2].trim() : lines.join(' ');
                const source = lines.length > 0 ? `Tio ${lines[0].trim()}` : 'Torrentio';

                return {
                    hash: s.infoHash?.toLowerCase(),
                    title: title,
                    quality: quality,
                    size: size,
                    seeds: seeds,
                    source: source,
                };
            }).filter(t => t.hash);
        } catch (e) { continue; }
    }
    return [];
}

// 6. Generic Stremio Addon Fetcher (Proxy to TPB+, Comet, etc)
async function fetchStremioAddon(sourceName, baseUrl, type, id) {
    try {
        const url = `${baseUrl}/stream/${type}/${id}.json`;
        const r = await axios.get(url, { ...getAxiosOpts(), timeout: 8000 });
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


// ─── Dedup + Build Streams ───────────────────────────────
const QUALITY_RANKS = {
    '2160P': 7,
    '4K': 7,
    'UHD': 7,
    '1080P': 6,
    '720P': 5,
    '480P': 4,
    'BDRIP': 3,
    'HDRIP': 3,
    'WEBRIP': 3,
    'WEB-DL': 3,
    'BLURAY': 3,
    'HDTV': 3,
    '?': 1,
    'CAM': 0,
    'TS': 0,
    'TELESYNC': 0
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

    // 1. Group by hash to combine sources & find max seeders
    const deduplicated = new Map();
    for (const t of torrents) {
        if (!t.hash) continue;
        const hash = t.hash.toLowerCase();

        if (deduplicated.has(hash)) {
            const existing = deduplicated.get(hash);
            // Combine source labels (e.g., 'YTS + Tio 1337x')
            if (!existing.source.includes(t.source)) {
                existing.source += ` + ${t.source}`;
            }
            // Keep the maximum reported seeders
            existing.seeds = Math.max(existing.seeds || 0, t.seeds || 0);

            // Prefer more descriptive titles
            if (t.title && t.title.length > (existing.title?.length || 0)) {
                existing.title = t.title;
            }
        } else {
            // Copy to avoid mutating original
            deduplicated.set(hash, { ...t, hash });
        }
    }

    const uniqueTorrents = Array.from(deduplicated.values());

    // 2. Sort by resolution (highest first), then seeders (most first)
    uniqueTorrents.sort((a, b) => {
        const qA = a.quality || parseQuality(a.title);
        const qB = b.quality || parseQuality(b.title);
        const rankA = getQualityRank(qA);
        const rankB = getQualityRank(qB);

        if (rankA !== rankB) {
            return rankB - rankA;
        }
        return (b.seeds || 0) - (a.seeds || 0);
    });

    // 3. Optional: Map ALL uniquely combined results into final streams (No limits, no hard filters)
    for (const t of uniqueTorrents) {
        const quality = t.quality || parseQuality(t.title);
        let info = '';
        if (t.codec) info += `${t.codec}`;
        if (t.audio) info += info ? ` ${t.audio}ch` : `${t.audio}ch`;
        if (t.size) info += info ? ` | ${t.size}` : `${t.size}`;
        info += info ? ` | 👤 ${t.seeds}` : `👤 ${t.seeds}`;

        // Lead with Resolution (Quality) 🖥️
        streams.push({
            url: `${baseUrl}/stream/${t.hash}`,
            title: `🖥️ ${quality} | ${info}\n${t.title} | ${t.source}`,
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
            // Fire ALL sources simultaneously — do NOT wait for YTS before starting others
            // This restores the 40+ results we had in v3.4.x
            const [
                meta,
                ytsResults,
                torrentioResults,
                tpbPlusResults,
                tpbImdbResults,
            ] = await Promise.all([
                getMeta(id, 'movie').catch(() => null),
                ytsImdbLookup(id).catch(() => []),
                fetchTorrentio('movie', id).catch(() => []),
                fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', 'movie', id).catch(() => []),
                tpbImdbLookup(id).catch(() => []),
            ]);

            const allTorrents = [
                ...ytsResults,
                ...torrentioResults,
                ...tpbPlusResults,
                ...tpbImdbResults,
            ];

            // Reduced Wave 1.5 (More stable sources)
            const backupResults = await Promise.all([
                fetchStremioAddon('Comet', 'https://comet.elfhosted.com/indexers=torrentio', 'movie', id).catch(() => []),
                fetchStremioAddon('MediaFusion-Indian', 'https://mediafusion.elfhosted.com/indexers=tamilblasters%7Ctamilmv%7Conlinemoviesgold%7Ctorrentio', 'movie', id).catch(() => []),
            ]);
            for (const r of backupResults) allTorrents.push(...r);

            // Small 100ms pause to let GC breathe before Title Wave
            await new Promise(resolve => setTimeout(resolve, 100));

            // Title-based searches (needs metadata, run in second parallel wave)
            if (meta?.name) {
                const titleResults = await Promise.allSettled([
                    ytsSearch(meta.name, meta.year),
                    tpbSearch(meta.name + ' ' + (meta.year || ''), '201,207'),
                    tpbSearch(meta.name + ' 1080p', '201,207'),
                    solidTorrentsSearch(meta.name + ' ' + (meta.year || '')),
                    btDigSearch(meta.name + ' ' + (meta.year || '')),
                    bitsearchSearch(meta.name + ' ' + (meta.year || '')),
                    nyaaRssSearch(meta.name),
                ]);
                for (const r of titleResults) {
                    if (r.status === 'fulfilled' && Array.isArray(r.value)) allTorrents.push(...r.value);
                }
            }

            if (allTorrents.length === 0) {
                console.log('[Stream] No movie torrents found from any source');
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] → ${streams.length} movie streams (${allTorrents.length} raw hits joined)`);
            return { streams };

        } else if (type === 'series') {
            const [imdbId, season, episode] = id.split(':');
            if (!imdbId || !season || !episode) return { streams: [] };

            const meta = await getMeta(imdbId, 'series');
            const showName = meta?.name;

            const sHex = season.padStart(2, '0');
            const eHex = episode.padStart(2, '0');
            const sShort = season.replace(/^0/, '');
            const eShort = episode.replace(/^0/, '');

            const sources1 = await Promise.allSettled([
                eztvSearch(imdbId, season, episode),
                fetchTorrentio('series', id),
                fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', 'series', id),
                tpbImdbLookup(imdbId),
            ]);

            const allTorrents = [];
            for (const s of sources1) {
                if (s.status === 'fulfilled' && s.value.length > 0) allTorrents.push(...s.value);
            }

            // Wave 1.5 + Small pause
            await new Promise(resolve => setTimeout(resolve, 100));
            const sources2 = await Promise.allSettled([
                fetchStremioAddon('MediaFusion-Indian', 'https://mediafusion.elfhosted.com/indexers=tamilblasters%7Ctamilmv%7Conlinemoviesgold%7Ctorrentio', 'series', id),
                solidTorrentsSearch(`${showName} S${sHex}E${eHex}`),
                solidTorrentsSearch(`${showName} ${sShort}x${eHex}`),
            ]);
            for (const s of sources2) {
                if (s.status === 'fulfilled' && s.value.length > 0) allTorrents.push(...s.value);
            }

            // Final Wave (Titles)
            await new Promise(resolve => setTimeout(resolve, 100));
            const sources3 = await Promise.allSettled([
                btDigSearch(`${showName} S${sHex}E${eHex}`),
                bitsearchSearch(`${showName} S${sHex}E${eHex}`),
                nyaaRssSearch(showName),
                showName ? tpbSearch(`${showName} S${sHex}E${eHex}`, '208') : Promise.resolve([]),
            ]);
            for (const s of sources3) {
                if (s.status === 'fulfilled' && s.value.length > 0) allTorrents.push(...s.value);
            }

            if (allTorrents.length === 0) {
                console.log(`[Stream] No series torrents found for ${showName || imdbId} S${season}E${episode}`);
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] → ${streams.length} series streams (${allTorrents.length} raw hits joined)`);
            return { streams };
        }

        return { streams: [] };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
