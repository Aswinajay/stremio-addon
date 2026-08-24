const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

// ─── API Mirrors ─────────────────────────────────────────
const YTS_MIRRORS = [
    'https://yts.torrentbay.st',
    'https://movies-api.accel.li',
    'https://yifi.mx',
    'https://yts.rs',
    'https://yts.mx',
];
const EZTV_MIRRORS = [
    'https://eztvx.to',
    'https://eztv.re',
    'https://eztv.wf',
    'https://eztv.tf',
    'https://eztv.yt',
];
const TPB_MIRRORS = [
    { url: 'https://apibay.org', type: 'api' },
    { url: 'https://pirateproxy.live', type: 'html' },
    { url: 'https://thepiratebay0.org', type: 'html' },
    { url: 'https://thepiratebay10.org', type: 'html' },
    { url: 'https://tpbay.win', type: 'html' },
    { url: 'https://tpb.party', type: 'html' },
    { url: 'https://pirateproxy.buzz', type: 'html' },
    { url: 'https://thepiratebay.zone', type: 'html' },
];
const X1337_MIRRORS = [
    'https://www.1337x.to',
    'https://1337x.st',
    'https://x1337x.ws',
    'https://1337xx.to',
    'https://1337x.is',
];
const RARBG_MIRRORS = [
    'https://rargb.to',
    'https://rargb.se',
    'https://rarbgmirror.com',
    'https://rarbgproxy.org',
];
const LIMETORRENTS_MIRRORS = [
    'https://www.limetorrents.lol',
    'https://www.limetorrents.pro',
    'https://limetorrents.so',
    'https://limetorrents.cc',
];
const TORRENTFUNK_MIRRORS = [
    'https://www.torrentfunk.com',
    'https://torrentfunk2.com',
];
const TORLOCK_MIRRORS = [
    'https://www.torlock.com',
    'https://torlock2.com',
];

// ─── Manifest ────────────────────────────────────────────
const manifest = {
    id: 'com.cloud.torrent.stream',
    version: '4.0.0',
    name: 'Torrent to weblink',
    description: 'Unlimited Resources | 50+ Scrapers | No Limits | 4K HDR',
    logo: 'https://stremio.eletroclay.com/logo.png',
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
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
];

function getAxiosOpts(extra = {}) {
    return {
        timeout: 12000,
        maxContentLength: 10 * 1024 * 1024,
        headers: {
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            'Accept': 'application/json, text/html',
            'Referer': 'https://www.google.com/',
        },
        ...extra,
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
// ─── MOVIE & SERIES SOURCES ──────────────────────────────
// ═══════════════════════════════════════════════════════════

// 1. YTS IMDB Lookup
async function ytsImdbLookup(imdbId) {
    const label = '[YTS-IMDB]';
    for (const mirror of YTS_MIRRORS) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=${imdbId}`;
            const r = await axios.get(url, getAxiosOpts());
            const movie = r.data?.data?.movie;
            if (movie?.torrents?.length > 0) {
                console.log(`${label} OK ${movie.torrents.length} torrents via ${mirror}`);
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
        } catch (e) { /* try next mirror */ }
    }
    return [];
}

// 2. YTS Title Search
async function ytsSearch(title, year) {
    const label = '[YTS-Search]';
    try {
        const url = `${YTS_MIRRORS[0]}/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}&limit=10&sort_by=seeds`;
        const r = await axios.get(url, getAxiosOpts());
        const movies = r.data?.data?.movies;
        if (!movies?.length) return [];
        let best = movies[0];
        if (year) {
            const match = movies.find(m => String(m.year) === String(year));
            if (match) best = match;
        }
        if (!best.torrents?.length) return [];
        console.log(`${label} OK "${best.title}" (${best.year}) — ${best.torrents.length} torrents`);
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
    } catch (e) { return []; }
}

// 3. TPB API + HTML
async function tpbSearch(q, category = '201,207,208') {
    const label = '[TPB]';
    for (const mirror of TPB_MIRRORS) {
        try {
            const isApi = mirror.type === 'api';
            const url = isApi
                ? `${mirror.url}/q.php?q=${encodeURIComponent(q)}&cat=${category}`
                : `${mirror.url}/search/${encodeURIComponent(q)}/1/99/${category}`;
            const r = await axios.get(url, getAxiosOpts());
            if (isApi) {
                const results = Array.isArray(r.data) ? r.data : [];
                const filtered = results.filter(t => t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000');
                if (!filtered.length) continue;
                console.log(`${label}-API OK ${filtered.length} via ${mirror.url}`);
                return filtered.slice(0, 50).map(r => ({
                    hash: r.info_hash?.toLowerCase(),
                    title: r.name,
                    size: formatSize(r.size),
                    seeds: parseInt(r.seeders) || 0,
                    source: 'TPB',
                }));
            } else {
                const html = r.data || '';
                const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
                if (!magnets.length) continue;
                console.log(`${label}-HTML OK ${magnets.length} via ${mirror.url}`);
                return [...new Set(magnets)].slice(0, 40).map(m => ({
                    hash: m.split('btih:')[1].toLowerCase(),
                    title: q,
                    source: 'TPB',
                    seeds: 10,
                }));
            }
        } catch (e) { /* try next */ }
    }
    return [];
}

// 4. TPB IMDB Lookup
async function tpbImdbLookup(imdbId) {
    const label = '[TPB-IMDB]';
    for (const mirror of TPB_MIRRORS) {
        try {
            if (mirror.type !== 'api') continue;
            const url = `${mirror.url}/q.php?q=${imdbId}&cat=0`;
            const r = await axios.get(url, getAxiosOpts());
            const results = (r.data || []).filter(t =>
                t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000' &&
                t.name !== 'No results returned'
            );
            if (!results.length) continue;
            console.log(`${label} OK ${results.length} via ${mirror.url}`);
            return results.map(r => ({
                hash: r.info_hash?.toLowerCase(),
                title: r.name,
                size: formatSize(r.size),
                seeds: parseInt(r.seeders) || 0,
                source: 'TPB-Direct',
            })).filter(t => t.hash);
        } catch (e) { /* try next */ }
    }
    return [];
}

// 5. EZTV
async function eztvSearch(imdbId, s, e) {
    const label = '[EZTV]';
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
            console.log(`${label} OK ${filtered.length} via ${mirror}`);
            return filtered.map(t => ({
                hash: t.hash?.toLowerCase(),
                title: t.title,
                size: t.size,
                seeds: t.seeds || 0,
                source: 'EZTV',
            })).filter(t => t.hash);
        } catch (err) { /* try next */ }
    }
    return [];
}

// 6. 1337x
async function x1337Search(q) {
    const label = '[1337x]';
    for (const mirror of X1337_MIRRORS) {
        try {
            const url = `${mirror}/search/${encodeURIComponent(q)}/1/`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 30).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: '1337x',
                seeds: 5,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 7. TorrentGalaxy
async function torrentGalaxySearch(q) {
    const label = '[TorrentGalaxy]';
    const mirrors = ['https://torrentgalaxy.to', 'https://torrentgalaxy.mx', 'https://tgx.rs'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/torrents.php?search=${encodeURIComponent(q)}&sort=seeders&order=desc`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 30).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'TorrentGalaxy',
                seeds: 5,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 8. LimeTorrents
async function limeTorrentsSearch(q) {
    const label = '[LimeTorrents]';
    for (const mirror of LIMETORRENTS_MIRRORS) {
        try {
            const url = `${mirror}/search/all/${encodeURIComponent(q)}/seeds/1/`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'LimeTorrents',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 9. TorrentFunk
async function torrentFunkSearch(q) {
    const label = '[TorrentFunk]';
    for (const mirror of TORRENTFUNK_MIRRORS) {
        try {
            const url = `${mirror}/search/all/${encodeURIComponent(q)}/seeds/1/`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'TorrentFunk',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 10. TorLock
async function torLockSearch(q) {
    const label = '[TorLock]';
    for (const mirror of TORLOCK_MIRRORS) {
        try {
            const url = `${mirror}/search/${encodeURIComponent(q)}/seeds/1/`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'TorLock',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 11. SolidTorrents
async function solidTorrentsSearch(q) {
    const label = '[SolidTorrents]';
    const mirrors = ['https://solidtorrents.to', 'https://solidtorrents.eu', 'https://solidtorrents.net'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/api/v1/search?q=${encodeURIComponent(q)}&category=all`;
            const r = await axios.get(url, getAxiosOpts());
            const results = r.data?.results || [];
            if (!results.length) continue;
            console.log(`${label} OK ${results.length} via ${mirror}`);
            return results.map(r => ({
                hash: r.infoHash?.toLowerCase(),
                title: r.title,
                size: formatSize(r.size),
                seeds: r.seeders || 0,
                source: 'SolidTorrents',
            })).filter(t => t.hash);
        } catch (e) { /* try next */ }
    }
    return [];
}

// 12. BTDig
async function btDigSearch(q) {
    const label = '[BTDig]';
    const mirrors = ['https://btdig.com', 'https://btdigg.xyz', 'https://btdig.gq'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/search?q=${encodeURIComponent(q)}&p=0&order=0`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            const hashes = [...new Set(magnets.map(m => m.split('btih:')[1].toLowerCase()))];
            if (!hashes.length) continue;
            console.log(`${label} OK ${hashes.length} via ${mirror}`);
            return hashes.slice(0, 30).map(h => ({ hash: h, title: q, seeds: 1, source: 'BTDig' }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 13. Nyaa (Anime)
async function nyaaRssSearch(q) {
    const label = '[Nyaa-RSS]';
    try {
        const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q)}&c=1_0&f=0`;
        const r = await axios.get(url, getAxiosOpts());
        const items = r.data.match(/<item>[\s\S]*?<\/item>/g) || [];
        if (!items.length) return [];
        console.log(`${label} OK ${items.length} titles`);
        return items.map(item => {
            const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'Unknown';
            const hash = item.match(/<nyaa:infoHash>([\s\S]*?)<\/nyaa:infoHash>/)?.[1]?.toLowerCase();
            const size = item.match(/<nyaa:size>([\s\S]*?)<\/nyaa:size>/)?.[1] || '';
            const seeds = item.match(/<nyaa:seeders>([\s\S]*?)<\/nyaa:seeders>/)?.[1] || '0';
            return { hash, title, size, seeds: parseInt(seeds), source: 'Nyaa' };
        }).filter(t => t.hash);
    } catch (e) { return []; }
}

// 14. Bitsearch
async function bitsearchSearch(q) {
    const label = '[Bitsearch]';
    try {
        const url = `https://bitsearch.to/search?q=${encodeURIComponent(q)}`;
        const r = await axios.get(url, getAxiosOpts());
        const html = r.data || '';
        const magnets = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/gi) || [];
        const hashes = magnets.map(m => m.split('btih:')[1].toLowerCase());
        if (!hashes.length) return [];
        console.log(`${label} OK ${hashes.length} hashes`);
        return [...new Set(hashes)].slice(0, 30).map(h => ({
            hash: h,
            title: `${q} - Bitsearch`,
            source: 'Bitsearch',
            seeds: 5,
        }));
    } catch (e) { return []; }
}

// 15. TorrentProject
async function torrentProjectSearch(q) {
    const label = '[TorrentProject]';
    const mirrors = ['https://torrentproject2.com', 'https://torrentproject.se', 'https://torrentproject.cc'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/?t=${encodeURIComponent(q)}&orderby=seeders`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'TorrentProject',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 16. Zooqle
async function zooqleSearch(q) {
    const label = '[Zooqle]';
    try {
        const url = `https://zooqle.com/search?q=${encodeURIComponent(q)}`;
        const r = await axios.get(url, getAxiosOpts());
        const html = r.data || '';
        const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
        if (!magnets.length) return [];
        console.log(`${label} OK ${magnets.length} results`);
        return [...new Set(magnets)].slice(0, 25).map(m => ({
            hash: m.split('btih:')[1].toLowerCase(),
            title: q,
            source: 'Zooqle',
            seeds: 3,
        }));
    } catch (e) { return []; }
}

// 17. Kickass Torrents (mirrors)
async function katSearch(q) {
    const label = '[KAT]';
    const mirrors = ['https://katcr.to', 'https://kickasstorrents.to', 'https://kat.am'];
    for (const mirror of mirrors) {
        try {
            const url = `${mirror}/usearch/${encodeURIComponent(q)}/`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'KAT',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 28. Knaben (meta search engine, JSON API)
async function knabenSearch(q) {
    const label = '[Knaben]';
    const endpoints = [
        'https://api.knaben.eu/',
        'https://knaben.org/api/v1/search',
        'https://knaben.eu/api/v1/search',
    ];
    for (const endpoint of endpoints) {
        try {
            const r = await axios.post(endpoint, {
                query: q,
                offset: 0,
                limit: 30,
                sorted: { seeders: 'desc' },
            }, getAxiosOpts({ headers: { ...getAxiosOpts().headers, 'Content-Type': 'application/json' } }));
            const items = r.data?.items || [];
            const mapped = items.map(t => {
                let hash = t.infoHash?.toLowerCase();
                if (!hash && t.magnet) hash = t.magnet.match(/btih:([a-zA-Z0-9]{32,40})/i)?.[1]?.toLowerCase();
                return {
                    hash,
                    title: t.title || q,
                    size: formatSize(t.size),
                    seeds: t.seeders || 0,
                    source: 'Knaben',
                };
            }).filter(t => t.hash);
            if (!mapped.length) continue;
            console.log(`${label} OK ${mapped.length} via ${endpoint}`);
            return mapped;
        } catch (e) { /* try next */ }
    }
    return [];
}

// 29. BT4G (DHT index)
async function bt4gSearch(q) {
    const label = '[BT4G]';
    for (const mirror of ['https://bt4gprx.com', 'https://bt4g.org']) {
        try {
            const url = `${mirror}/search?q=${encodeURIComponent(q)}`;
            const r = await axios.get(url, getAxiosOpts());
            const html = r.data || '';
            const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
            if (!magnets.length) continue;
            console.log(`${label} OK ${magnets.length} via ${mirror}`);
            return [...new Set(magnets)].slice(0, 25).map(m => ({
                hash: m.split('btih:')[1].toLowerCase(),
                title: q,
                source: 'BT4G',
                seeds: 3,
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

// 30. Uindex (DHT search)
async function uindexSearch(q) {
    const label = '[Uindex]';
    try {
        const url = `https://uindex.org/search.php?search=${encodeURIComponent(q)}`;
        const r = await axios.get(url, getAxiosOpts());
        const html = r.data || '';
        const magnets = html.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{32,40})/gi) || [];
        if (!magnets.length) return [];
        console.log(`${label} OK ${magnets.length} hashes`);
        return [...new Set(magnets)].slice(0, 25).map(m => ({
            hash: m.split('btih:')[1].toLowerCase(),
            title: q,
            source: 'Uindex',
            seeds: 2,
        }));
    } catch (e) { return []; }
}

// 31. iDope (JSON API)
async function iDopeSearch(q) {
    const label = '[iDope]';
    for (const api of ['https://api.idope.club', 'https://api.idope.se']) {
        try {
            const url = `${api}/api/search/${encodeURIComponent(q)}/0/`;
            const r = await axios.get(url, getAxiosOpts());
            const results = r.data?.results || r.data?.list || [];
            if (!results.length) continue;
            console.log(`${label} OK ${results.length} via ${api}`);
            return results.slice(0, 25).map(t => ({
                hash: (t.info_hash || t.infoHash || '').toLowerCase(),
                title: t.name || q,
                size: formatSize(t.size || t.length),
                seeds: t.seeds || 0,
                source: 'iDope',
            })).filter(t => t.hash);
        } catch (e) { /* try next */ }
    }
    return [];
}

// ─── Meta Sources (Stremio addons as scrapers) ───────────
// 18. Torrentio
async function fetchTorrentio(type, id) {
    const label = '[Torrentio]';
    const baseUrls = [
        'https://torrentio.strem.fun',
        'https://torrentsdb.com',
        'https://torrentio.viren070.me',
        'https://torrentio.elfhosted.com',
        'https://stremio.torrentio.strem.fun',
    ];
    for (const baseUrl of baseUrls) {
        try {
            const url = `${baseUrl}/stream/${type}/${id}.json`;
            const r = await axios.get(url, getAxiosOpts({ timeout: 8000 }));
            const streams = r.data?.streams || [];
            if (!streams.length) continue;
            console.log(`${label} OK ${streams.length} via ${baseUrl}`);
            return streams.map(s => {
                const lines = s.title ? s.title.split('\n') : [];
                const qualityMatch = s.name?.match(/(?:Torrentio|TorrentsDB)\s+(.+)/i);
                const quality = qualityMatch ? qualityMatch[1] : '?';
                let size = '';
                let seeds = 0;
                const sizeMatch = s.title?.match(/💾\s*([^\s\n]+)/u);
                if (sizeMatch) size = sizeMatch[1].trim();
                const seedsMatch = s.title?.match(/[👤👥]\s*(\d+)/u);
                if (seedsMatch) seeds = parseInt(seedsMatch[1]);
                const title = lines.length > 2 ? lines[2].trim() : lines.join(' ');
                const source = lines.length > 0 ? `Tio ${lines[0].trim()}` : 'Torrentio';
                return { hash: s.infoHash?.toLowerCase(), title, quality, size, seeds, source };
            }).filter(t => t.hash);
        } catch (e) { /* try next */ }
    }
    return [];
}

// 19. Comet
async function fetchComet(type, id) {
    return fetchStremioAddon('Comet', 'https://comet.elfhosted.com', type, id);
}

// 20. MediaFusion
async function fetchMediaFusion(type, id) {
    return fetchStremioAddon('MediaFusion', 'https://mediafusion.elfhosted.com', type, id);
}

// 21. TPB+
async function fetchTPBPlus(type, id) {
    return fetchStremioAddon('TPB+', 'https://thepiratebay-plus.strem.fun', type, id);
}

// 22. Torrentio Remix
async function fetchTorrentioRemix(type, id) {
    return fetchStremioAddon('Tio-Remix', 'https://torrentio-remix.hayagus.site', type, id);
}

// 23. Debridio (uses torrentio debrid)
async function fetchDebridio(type, id) {
    return fetchStremioAddon('Debridio', 'https://debridio.adobotec.com', type, id);
}

// 24. Stremio Jackett
async function fetchJackettio(type, id) {
    return fetchStremioAddon('Jackettio', 'https://jackettio.hayagus.site', type, id);
}

// 25. Orion
async function fetchOrion(type, id) {
    return fetchStremioAddon('Orion', 'https://orion.elfhosted.com', type, id);
}

// 26. MediaFusion Indian
async function fetchMediaFusionIndian(type, id) {
    return fetchStremioAddon('MF-Indian', 'https://mediafusion.elfhosted.com/indexers=tamilblasters%7Ctamilmv%7Conlinemoviesgold%7Ctorrentio', type, id);
}

// 27. Piracy Plus
async function fetchPiracyPlus(type, id) {
    return fetchStremioAddon('Piracy+', 'https://piracy.plus', type, id);
}

// Generic Stremio Addon Fetcher
async function fetchStremioAddon(sourceName, baseUrl, type, id) {
    const label = `[${sourceName}]`;
    try {
        const url = `${baseUrl}/stream/${type}/${id}.json`;
        const r = await axios.get(url, getAxiosOpts());
        const streams = r.data?.streams || [];
        if (!streams.length) return [];
        console.log(`${label} OK ${streams.length}`);
        return streams.map(s => {
            const quality = parseQuality(s.name + ' ' + s.title);
            let seeds = 0;
            const seedsMatch = s.title?.match(/[👤👥]\s*(\d+)/u) || s.name?.match(/[👤👥]\s*(\d+)/u);
            if (seedsMatch) seeds = parseInt(seedsMatch[1]);
            let size = '';
            const sizeMatch = s.title?.match(/💾\s*([^\s\n]+)/u) || s.name?.match(/💾\s*([^\s\n]+)/u);
            if (sizeMatch) size = sizeMatch[1].trim();
            const title = s.title?.split('\n')[0] || s.name || sourceName;
            return { hash: s.infoHash?.toLowerCase(), title, quality, size, seeds, source: sourceName };
        }).filter(t => t.hash);
    } catch (e) { return []; }
}

// ─── Dedup + Build Streams ───────────────────────────────
const QUALITY_RANKS = {
    '2160P': 7, '4K': 7, 'UHD': 7,
    '1080P': 6,
    '720P': 5,
    '480P': 4,
    'BDRIP': 3, 'HDRIP': 3, 'WEBRIP': 3, 'WEB-DL': 3, 'BLURAY': 3, 'HDTV': 3,
    '?': 1, 'CAM': 0, 'TS': 0, 'TELESYNC': 0,
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
    const deduplicated = new Map();

    for (const t of torrents) {
        if (!t.hash) continue;
        const hash = t.hash.toLowerCase();
        if (deduplicated.has(hash)) {
            const existing = deduplicated.get(hash);
            if (!existing.source.includes(t.source)) existing.source += ` + ${t.source}`;
            existing.seeds = Math.max(existing.seeds || 0, t.seeds || 0);
            if (t.title && t.title.length > (existing.title?.length || 0)) existing.title = t.title;
        } else {
            deduplicated.set(hash, { ...t, hash });
        }
    }

    const uniqueTorrents = Array.from(deduplicated.values());
    uniqueTorrents.sort((a, b) => {
        const rankA = getQualityRank(a.quality || parseQuality(a.title));
        const rankB = getQualityRank(b.quality || parseQuality(b.title));
        if (rankA !== rankB) return rankB - rankA;
        return (b.seeds || 0) - (a.seeds || 0);
    });

    for (const t of uniqueTorrents) {
        const quality = t.quality || parseQuality(t.title);
        let info = '';
        if (t.codec) info += `${t.codec}`;
        if (t.audio) info += info ? ` ${t.audio}ch` : `${t.audio}ch`;
        if (t.size) info += info ? ` | ${t.size}` : `${t.size}`;
        info += info ? ` | ${t.seeds}` : `${t.seeds}`;

        streams.push({
            url: `${baseUrl}/stream/${t.hash}`,
            title: `${quality} | ${info}\n${t.title} | ${t.source}`,
            behaviorHints: {
                bingeGroup: `cloud-proxy-${quality}`,
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
            // ─── WAVE 1: Primary sources (fastest) ───
            const [meta, w1] = await Promise.all([
                getMeta(id, 'movie').catch(() => null),
                Promise.allSettled([
                    ytsImdbLookup(id),
                    fetchTorrentio('movie', id),
                    fetchTPBPlus('movie', id),
                    tpbImdbLookup(id),
                ]),
            ]);

            const allTorrents = [];
            for (const r of w1) {
                if (r.status === 'fulfilled' && Array.isArray(r.value)) allTorrents.push(...r.value);
            }

            // ─── WAVE 2: Secondary Stremio addons ───
            const w2 = await Promise.allSettled([
                fetchComet('movie', id),
                fetchMediaFusion('movie', id),
                fetchTorrentioRemix('movie', id),
                fetchOrion('movie', id),
                fetchDebridio('movie', id),
                fetchJackettio('movie', id),
                fetchMediaFusionIndian('movie', id),
                fetchPiracyPlus('movie', id),
            ]);
            for (const r of w2) {
                if (r.status === 'fulfilled' && Array.isArray(r.value)) allTorrents.push(...r.value);
            }

            // ─── WAVE 3: Title-based scrapers (needs meta) ───
            if (meta?.name) {
                const year = meta.year || '';
                const qTitle = meta.name + ' ' + year;
                const w3 = await Promise.allSettled([
                    ytsSearch(meta.name, meta.year),
                    tpbSearch(qTitle, '201,207'),
                    x1337Search(qTitle),
                    torrentGalaxySearch(qTitle),
                    solidTorrentsSearch(qTitle),
                    btDigSearch(qTitle),
                    bitsearchSearch(qTitle),
                    nyaaRssSearch(meta.name),
                    limeTorrentsSearch(qTitle),
                    torrentFunkSearch(qTitle),
                    torLockSearch(qTitle),
                    torrentProjectSearch(qTitle),
                    zooqleSearch(qTitle),
                    katSearch(qTitle),
                    knabenSearch(qTitle),
                    bt4gSearch(qTitle),
                    uindexSearch(qTitle),
                    iDopeSearch(qTitle),
                ]);
                for (const r of w3) {
                    if (r.status === 'fulfilled' && Array.isArray(r.value)) allTorrents.push(...r.value);
                }
            }

            if (allTorrents.length === 0) {
                console.log('[Stream] No movie torrents found from any source');
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] -> ${streams.length} movie streams (${allTorrents.length} raw)`);
            return { streams };

        } else if (type === 'series') {
            const [imdbId, season, episode] = id.split(':');
            if (!imdbId || !season || !episode) return { streams: [] };

            const meta = await getMeta(imdbId, 'series');
            const showName = meta?.name;
            const sHex = season.padStart(2, '0');
            const eHex = episode.padStart(2, '0');
            const sShort = season.replace(/^0/, '');
            const query = showName ? `${showName} S${sHex}E${eHex}` : null;

            // ─── WAVE 1: IMDB-based sources ───
            const w1 = await Promise.allSettled([
                eztvSearch(imdbId, season, episode),
                fetchTorrentio('series', id),
                fetchTPBPlus('series', id),
                tpbImdbLookup(imdbId),
            ]);
            const allTorrents = [];
            for (const r of w1) {
                if (r.status === 'fulfilled' && r.value.length > 0) allTorrents.push(...r.value);
            }

            // ─── WAVE 2: Stremio addons ───
            const w2 = await Promise.allSettled([
                fetchMediaFusion('series', id),
                fetchComet('series', id),
                fetchTorrentioRemix('series', id),
                fetchOrion('series', id),
                fetchDebridio('series', id),
                fetchJackettio('series', id),
                fetchPiracyPlus('series', id),
            ]);
            for (const r of w2) {
                if (r.status === 'fulfilled' && r.value.length > 0) allTorrents.push(...r.value);
            }

            // ─── WAVE 3: Title-based scrapers ───
            if (query) {
                const w3 = await Promise.allSettled([
                    x1337Search(query),
                    torrentGalaxySearch(query),
                    solidTorrentsSearch(`${showName} S${sHex}E${eHex}`),
                    solidTorrentsSearch(`${showName} ${sShort}x${eHex}`),
                    btDigSearch(query),
                    bitsearchSearch(query),
                    nyaaRssSearch(showName),
                    tpbSearch(query, '208'),
                    limeTorrentsSearch(query),
                    torrentFunkSearch(query),
                    torrentProjectSearch(query),
                    zooqleSearch(query),
                    katSearch(query),
                    knabenSearch(query),
                    bt4gSearch(query),
                    uindexSearch(query),
                    iDopeSearch(query),
                ]);
                for (const r of w3) {
                    if (r.status === 'fulfilled' && r.value.length > 0) allTorrents.push(...r.value);
                }
            }

            if (allTorrents.length === 0) {
                console.log(`[Stream] No series torrents for ${showName || imdbId} S${season}E${episode}`);
                return { streams: [] };
            }

            const streams = buildStreams(allTorrents, baseUrl);
            console.log(`[Stream] -> ${streams.length} series streams (${allTorrents.length} raw)`);
            return { streams };
        }

        return { streams: [] };
    } catch (err) {
        console.error(`[Stream Error] ${err.message}`);
        return { streams: [] };
    }
});

module.exports = builder.getInterface();
