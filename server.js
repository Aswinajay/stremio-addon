const express = require('express');
const cors = require('cors');
const torrentStream = require('torrent-stream');
const addonInterface = require('./addon');
const { getRouter } = require('stremio-addon-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ────────────────────────────────────────────────
app.use(cors());

// ─── Static Files ────────────────────────────────────────
app.use(express.static('public'));

// ─── Health check ────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        version: '3.5.31',
        dashboard: `https://${_req.get('host')}/dashboard`,
        activeEngines: Object.keys(activeEngines).length,
        maxEngines: 'Unlimited',
        ramUsageMB: getRamUsageMB(),
        ramTrendMBs: getRamTrend().toFixed(2),
        dynamicMode: getDynamicLimits().mode,
        activePeerBudget: getDynamicLimits().connections,
        ramLimitMB: RAM_LIMIT_MB,
        uptime: process.uptime(),
    });
});

// ─── Debug: test API connectivity ────────────────────────
const axios = require('axios');
app.get('/debug', async (_req, res) => {
    const results = {};
    for (const mirror of ['https://yts.torrentbay.st', 'https://movies-api.accel.li']) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=tt1375666`;
            const r = await axios.get(url, { timeout: 10000 });
            const torrents = r.data?.data?.movie?.torrents?.length || 0;
            results[mirror] = { status: 'ok', torrents };
        } catch (err) {
            results[mirror] = { status: 'error', message: err.message, code: err.response?.status };
        }
    }
    try {
        const url = 'https://eztvx.to/api/get-torrents?imdb_id=0944947&limit=5';
        const r = await axios.get(url, { timeout: 10000 });
        results['eztv'] = { status: 'ok', torrents: r.data?.torrents?.length || 0 };
    } catch (err) {
        results['eztv'] = { status: 'error', message: err.message, code: err.response?.status };
    }
    try {
        const url = 'https://apibay.org/q.php?q=test&cat=0';
        const r = await axios.get(url, { timeout: 10000 });
        results['tpb'] = { status: 'ok', count: r.data?.length || 0 };
    } catch (err) {
        results['tpb'] = { status: 'error', message: err.message, code: err.response?.status };
    }
    res.json({ version: '3.4.0', results });
});

// ─── Dashboard ───────────────────────────────────────────
app.get('/dashboard', (req, res) => {
    const engines = Object.entries(activeEngines).map(([hash, entry]) => ({
        id: hash.substring(0, 8),
        ready: entry.isReady,
        activeStreams: entry.activeStreams || 0,
        speed: (entry.engine.swarm.downloadSpeed() / 1024 / 1024).toFixed(2) + ' MB/s',
        peers: entry.engine.swarm.wires.length,
        downloaded: (entry.engine.swarm.downloaded / 1024 / 1024).toFixed(2) + ' MB',
        lastAccess: new Date(entry.lastAccess).toLocaleTimeString(),
        files: entry.engine.files?.length || 0
    }));

    const limits = getDynamicLimits();
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Live Monitor</title>
        <style>
            body { background: #121212; color: #fff; font-family: sans-serif; padding: 20px; }
            .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 1px solid #333; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
            .stat { color: #8b5cf6; font-weight: bold; }
            h1 { color: #8b5cf6; margin-bottom: 5px; }
            .mode-badge { display: inline-block; padding: 4px 10px; border-radius: 5px; font-size: 0.8rem; font-weight: bold; margin-left: 10px; background: #8b5cf6; color: #fff; vertical-align: middle; }
            .refresh { font-size: 0.8rem; color: #666; margin-bottom: 20px; }
        </style>
        <meta http-equiv="refresh" content="5">
    </head>
    <body>
        <h1>📊 Live Stream Monitor <span class="mode-badge">${limits.mode} MODE</span></h1>
        <div class="refresh">Auto-refreshing every 5 seconds. Active Engines: ${engines.length} / Unlimited (RAM Limit: ${RAM_LIMIT_MB}MB)</div>
        <div class="grid">
            ${engines.length ? engines.map(e => `
                <div class="card">
                    <div><b>Engine ID:</b> ${e.id}</div>
                    <div><b>Status:</b> ${e.ready ? '✅ Ready' : '⏳ Connecting'}</div>
                    <div><b>Active Streams:</b> <span class="stat">${e.activeStreams}</span></div>
                    <div><b>Speed:</b> <span class="stat">${e.speed}</span></div>
                    <div><b>Peers:</b> ${e.peers}</div>
                    <div><b>Downloaded:</b> ${e.downloaded}</div>
                    <div><b>Files:</b> ${e.files}</div>
                    <div><b>Last Activity:</b> ${e.lastAccess}</div>
                </div>
            `).join('') : '<div class="card">No active streams. Start watching something in Stremio!</div>'}
        </div>
        <div style="margin-top: 30px;"><a href="/" style="color: #666; font-size: 0.9rem;">← Back to Landing Page</a></div>
    </body>
    </html>
    `);
});
// ─── Landing Page ────────────────────────────────────────
app.get('/', (req, res) => {
    const host = req.get('host') || 'stremio.eletroclay.com';
    const installUrl = `stremio://${host}/manifest.json`;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Torrent to weblink | Stremio Addon</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Outfit', sans-serif;
                background: radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0d0d17 100%);
                color: #e2e8f0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
                overflow: hidden;
            }
            .glow {
                position: absolute;
                width: 600px;
                height: 600px;
                background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
                top: -200px;
                border-radius: 50%;
                z-index: 0;
                animation: pulse 8s ease-in-out infinite alternate;
            }
            @keyframes pulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.1); opacity: 1; }
            }
            .container {
                position: relative;
                z-index: 1;
                max-width: 700px;
                padding: 50px 40px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 24px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: floatUp 1s ease-out forwards;
            }
            @keyframes floatUp {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            h1 {
                font-size: 3.5rem;
                font-weight: 800;
                margin-bottom: 15px;
                background: linear-gradient(135deg, #a78bfa 0%, #ec4899 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -1px;
            }
            p.subtitle {
                font-size: 1.25rem;
                line-height: 1.6;
                color: #94a3b8;
                margin-bottom: 40px;
                font-weight: 300;
            }
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
                color: white;
                text-decoration: none;
                padding: 16px 48px;
                font-size: 1.25rem;
                font-weight: 600;
                border-radius: 50px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 10px 25px rgba(139, 92, 246, 0.5);
                position: relative;
                overflow: hidden;
            }
            .btn::after {
                content: '';
                position: absolute;
                top: 0; left: -100%; width: 50%; height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transform: skewX(-20deg);
                transition: 0.5s;
            }
            .btn:hover::after {
                left: 150%;
            }
            .btn:hover {
                transform: translateY(-3px) scale(1.02);
                box-shadow: 0 15px 35px rgba(139, 92, 246, 0.6);
            }
            .btn-links {
                margin-top: 25px;
                display: flex;
                gap: 20px;
                justify-content: center;
            }
            .link {
                color: #8b5cf6;
                text-decoration: none;
                font-weight: 600;
                font-size: 1rem;
                transition: color 0.2s;
            }
            .link:hover {
                color: #a78bfa;
            }
            .features {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 15px;
                margin-top: 40px;
            }
            .feature {
                background: rgba(139, 92, 246, 0.1);
                padding: 12px 24px;
                border-radius: 12px;
                font-size: 0.95rem;
                font-weight: 600;
                color: #e2e8f0;
                border: 1px solid rgba(139, 92, 246, 0.2);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: transform 0.2s, background 0.2s;
            }
            .feature:hover {
                transform: translateY(-2px);
                background: rgba(139, 92, 246, 0.2);
            }
        </style>
    </head>
    <body>
        <div class="glow"></div>
        <div class="container">
            <h1>Torrent to weblink</h1>
            <p class="subtitle">
                The ultimate Stremio addon powered by the <b>Hydra Brain</b> engine. Experience flawless, buffer-free 4K & HDR streaming with an intelligent cloud proxy that guarantees 100% uptime.
            </p>
            <a href="${installUrl}" class="btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                Install in Stremio
            </a>
            
            <div class="btn-links">
                <a href="/dashboard" class="link">📊 Live Monitor</a>
                <a href="https://github.com/Aswinajay/stremio-addon" target="_blank" class="link">⭐ GitHub</a>
                <a href="https://www.buymeacoffee.com/withaswin" target="_blank" class="link">☕ Support Me</a>
            </div>
            
            <div class="features">
                <div class="feature">⚡ Cloud Proxy</div>
                <div class="feature">🧠 Hydra Brain Protection</div>
                <div class="feature">🎬 40+ Aggregated Sources</div>
            </div>
        </div>
    </body>
    </html>
    `);
});

// ─── Stremio Addon SDK routes ────────────────────────────
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

// ─── Torrent Engine Management ───────────────────────────
const RAM_LIMIT_MB = parseInt(process.env.RAM_LIMIT_MB) || 250;        // Guardrail
const DISK_LIMIT_MB = parseInt(process.env.DISK_LIMIT_MB) || 300;      // /tmp disk guardrail
const ENGINE_TIMEOUT = 10 * 60 * 1000;
const CONNECT_TIMEOUT = 90000;
const ZOMBIE_TIMEOUT = 2 * 60 * 1000;
const activeEngines = {};

// ─── /tmp Disk Guard ───────────────────────────────────────
const { execSync } = require('child_process');
function getTmpDiskMB() {
    try {
        // du -sm returns MBs for the torrent-stream cache directory
        const out = execSync('du -sm /tmp/torrent-stream 2>/dev/null || echo 0').toString().trim();
        return parseInt(out.split('\t')[0]) || 0;
    } catch (e) { return 0; }
}
function purgeTmpIfNeeded() {
    const diskMB = getTmpDiskMB();
    if (diskMB < DISK_LIMIT_MB) return;
    console.log(`[DiskGuard] 💾 /tmp disk usage: ${diskMB}MB exceeds ${DISK_LIMIT_MB}MB limit — purging stale cache...`);
    try {
        const cacheDir = '/tmp/torrent-stream/torrent-stream';
        const fs = require('fs');
        if (!fs.existsSync(cacheDir)) return;
        const hashes = fs.readdirSync(cacheDir);
        // Find hashes NOT currently in activeEngines and delete them
        const activeHashes = new Set(Object.keys(activeEngines));
        for (const hash of hashes) {
            if (!activeHashes.has(hash)) {
                try {
                    execSync(`rm -rf "${cacheDir}/${hash}"`);
                    console.log(`[DiskGuard] 🗑️ Purged stale cache: ${hash.substring(0, 8)}…`);
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore */ }
}
// Scan /tmp every 60s (safety net — memory storage should prevent disk growth)
setInterval(purgeTmpIfNeeded, 60 * 1000);

// ─── Memory-Only Piece Storage ──────────────────────────────
// For a streaming proxy we never need to persist pieces to disk.
// Pieces live in RAM just long enough to be served over HTTP, then GC'd.
// This eliminates the /tmp disk exhaustion that caused OOM restarts.
function createMemoryStorage() {
    const MAX_PIECES = 96; // max pieces to keep in RAM per engine (~96 * typical 256KB = ~24MB)
    return function (pieceLength, opts) {
        // Map<index, {buf: Buffer, t: number}> — t used for LRU eviction
        const store = new Map();

        const evictOldestIfNeeded = () => {
            if (store.size <= MAX_PIECES) return;
            let oldestKey = null, oldestTime = Infinity;
            for (const [k, v] of store) {
                if (v.t < oldestTime) { oldestKey = k; oldestTime = v.t; }
            }
            if (oldestKey !== null) store.delete(oldestKey);
        };

        return {
            get(index, opts2, cb) {
                if (typeof opts2 === 'function') { cb = opts2; opts2 = {}; }
                const entry = store.get(index);
                if (!entry) return cb(new Error('piece not in memory'));
                const buf = entry.buf;
                const offset = (opts2 && opts2.offset) || 0;
                const length = (opts2 && opts2.length != null) ? opts2.length : buf.length - offset;
                cb(null, buf.slice(offset, offset + length));
            },
            put(index, buf, cb) {
                store.set(index, { buf, t: Date.now() });
                evictOldestIfNeeded();
                if (cb) cb(null);
            },
            close(cb) { store.clear(); if (cb) cb(null); },
            destroy(cb) { store.clear(); if (cb) cb(null); }
        };
    };
}

// ─── Hydra Brain: Advanced Dynamic Resource Controller ───────
// Tracks RAM trend (velocity) across real-time samples to be PREDICTIVE
let _ramHistory = [];
function recordRamSample() {
    const now = getRamUsageMB();
    _ramHistory.push({ t: Date.now(), v: now });
    if (_ramHistory.length > 6) _ramHistory.shift(); // keep last 30s
}
function getRamTrend() {
    // Returns MB/s change velocity (positive = climbing, negative = falling)
    if (_ramHistory.length < 2) return 0;
    const oldest = _ramHistory[0];
    const newest = _ramHistory[_ramHistory.length - 1];
    const dtSec = (newest.t - oldest.t) / 1000;
    if (dtSec === 0) return 0;
    return (newest.v - oldest.v) / dtSec; // MB/sec
}

function getDynamicLimits(forInfoHash) {
    recordRamSample();
    const ram = getRamUsageMB();
    const trend = getRamTrend();   // MB/sec, positive = RAM is rising
    const engines = Object.values(activeEngines);
    const numEngines = engines.length || 1;

    // ── 1. Predictive Headroom ──────────────────────────────
    // Project forward 10s: if RAM is climbing, shrink headroom *now*
    const projectedRam = ram + (trend * 10);
    const effectiveRam = Math.max(ram, Math.min(RAM_LIMIT_MB, projectedRam));
    const headRoom = Math.max(0, RAM_LIMIT_MB - effectiveRam);

    // ── 2. Total Peer Budget (0.7 peers per MB of headroom) ──
    const totalBudget = Math.floor(headRoom * 0.7);

    // ── 3. Per-Engine Weighted Budget ───────────────────────
    // Engines with active streams get a bigger slice; idle ones get minimal
    // Weight formula: active ? (1 + avgSpeed) : 0.1
    let perEngineConns;
    if (forInfoHash && activeEngines[forInfoHash]) {
        const me = activeEngines[forInfoHash];
        const myWeight = me.activeStreams > 0 ? (1 + Math.min(3, (me.speedSamples?.slice(-1)[0] || 0))) : 0.1;
        const totalWeight = engines.reduce((sum, e) => {
            return sum + (e.activeStreams > 0 ? (1 + Math.min(3, (e.speedSamples?.slice(-1)[0] || 0))) : 0.1);
        }, 0);
        const myShare = totalWeight > 0 ? myWeight / totalWeight : 1 / numEngines;
        perEngineConns = Math.floor(totalBudget * myShare);
    } else {
        // Generic call (no engine context): even split
        perEngineConns = Math.floor(totalBudget / numEngines);
    }

    // ── 4. Pressure Multiplier ──────────────────────────────
    // Exponential squeeze as RAM nears the ceiling
    const pressureRatio = Math.max(0, Math.min(1, effectiveRam / RAM_LIMIT_MB));
    const pressureMultiplier = Math.pow(1 - pressureRatio, 1.5); // 0..1 curve
    perEngineConns = Math.max(1, Math.min(80, Math.floor(perEngineConns * (0.3 + 0.7 * pressureMultiplier))));

    // ── 5. Mode Label ───────────────────────────────────────
    let mode = 'HIGH';
    if (effectiveRam > 195) mode = 'EMERGENCY';
    else if (effectiveRam > 185) mode = 'CRITICAL';
    else if (effectiveRam > 170) mode = 'SEVERE';
    else if (effectiveRam > 150) mode = 'LOW';
    else if (effectiveRam > 120) mode = 'MEDIUM';
    else if (effectiveRam > 100) mode = 'BALANCED';

    const trendStr = trend >= 0 ? `+${trend.toFixed(1)}` : trend.toFixed(1);
    return {
        connections: perEngineConns,
        mode,
        label: `${mode} | 🧠${ram}MB ${trendStr}MB/s | ${perEngineConns}c`,
        ram,
        trend,
    };
}

function getRamUsageMB() {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function getTrackers() {
    // Source: ngosang/trackerslist (best + all_udp + all_https) — March 2025
    return [
        // ── Tier 1: Highest traffic ─────────────────────────
        'udp://tracker.opentrackr.org:1337/announce',
        'http://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://www.torrent.eu.org:451/announce',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'http://tracker.openbittorrent.com:80/announce',
        'udp://9.rarbg.com:2810/announce',
        'udp://bt1.archive.org:6969/announce',
        'udp://bt2.archive.org:6969/announce',
        // ── Tier 2: Best list ───────────────────────────────
        'https://torrent.tracker.durukanbal.com:443/announce',
        'https://cny.fan:443/announce',
        'udp://utracker.ghostchu-services.top:6969/announce',
        'udp://udp.tracker.projectk.org:23333/announce',
        'udp://tracker1.myporn.club:9337/announce',
        'udp://tracker.tvunderground.org.ru:3218/announce',
        'udp://tracker.tryhackx.org:6969/announce',
        'udp://tracker.torrust-demo.com:6969/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker.t-1.org:6969/announce',
        'udp://tracker.srv00.com:6969/announce',
        'udp://tracker.qu.ax:6969/announce',
        'udp://tracker.playground.ru:6969/announce',
        'udp://tracker.opentorrent.top:6969/announce',
        'udp://tracker.ixuexi.click:6969/announce',
        'udp://tracker.gmi.gd:6969/announce',
        'udp://tracker.fnix.net:6969/announce',
        'udp://tracker.filemail.com:6969/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://tracker.corpscorp.online:80/announce',
        'udp://tracker.bluefrog.pw:2710/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://tracker.alaskantf.com:6969/announce',
        'udp://tracker.1h.is:1337/announce',
        'udp://tracker-udp.gbitt.info:80/announce',
        'udp://tr4ck3r.duckdns.org:6969/announce',
        'udp://retracker.lanta.me:2710/announce',
        'udp://opentracker.io:6969/announce',
        'udp://open.dstud.io:6969/announce',
        'udp://leet-tracker.moe:1337/announce',
        'udp://explodie.org:6969/announce',
        'udp://evan.im:6969/announce',
        'udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce',
        'udp://bandito.byterunner.io:6969/announce',
        // ── Tier 3: Extended UDP list ───────────────────────
        'udp://tracker.zupix.online:6969/announce',
        'udp://tracker.therarbg.to:6969/announce',
        'udp://tracker.flatuslifir.is:6969/announce',
        'udp://tracker.ducks.party:1984/announce',
        'udp://tracker.ddunlimited.net:6969/announce',
        'udp://torrentclub.online:54123/announce',
        'udp://open.demonoid.ch:6969/announce',
        'udp://ipv4announce.sktorrent.eu:6969/announce',
        'udp://tracker.moeking.me:6969/announce',
        'udp://tracker.publictracker.xyz:6969/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'udp://tracker.cyberia.is:6969/announce',
        'udp://tracker.birkenwald.de:6969/announce',
        'udp://tracker.auctor.tv:6969/announce',
        'udp://tracker.bitsearch.to:1337/announce',
        'udp://tracker.bt4g.com:2095/announce',
        'udp://tracker.monitorit4.me:6969/announce',
        'udp://tracker.army:6969/announce',
        'udp://tracker.ds.is:6969/announce',
        'udp://tracker.kicks-ass.net:80/announce',
        'udp://tracker.irxh.net:1337/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
        // ── Tier 4: HTTPS (bypass UDP blocks on Render) ─────
        'https://tracker.zhuqiy.com:443/announce',
        'https://tracker.tamersunion.org:443/announce',
        'https://tracker.nanoha.org:443/announce',
        'https://tracker.lilithraws.org:443/announce',
        'https://tr.hostux.net:443/announce',
        'https://tracker.gbitt.info:443/announce',
        'https://tracker.loligirl.cn:443/announce',
        'https://tracker.imgoingto.icu:443/announce',
        'https://t.zerg.pw:443/announce',
        'https://tracker.renfei.net:443/announce',
        'http://t.overflow.biz:6969/announce',
    ];
}

function buildMagnet(infoHash) {
    const trackers = getTrackers();
    const trackerParams = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}${trackerParams}`;
}

function evictIfNeeded() {
    const keys = Object.keys(activeEngines);
    const ramMB = getRamUsageMB();
    const overRam = ramMB > RAM_LIMIT_MB;

    if (!overRam) return;

    const reason = `RAM ${ramMB}MB > ${RAM_LIMIT_MB}MB limit`;
    console.log(`[Engine] Eviction triggered: ${reason}`);

    // Priority 1: Zombie engines (0 speed, 0 active streams)
    const zombie = keys.find(k => {
        const e = activeEngines[k];
        return e.activeStreams === 0 && e.lastNonZeroSpeed && (Date.now() - e.lastNonZeroSpeed > ZOMBIE_TIMEOUT);
    });
    if (zombie) {
        console.log(`[Engine] Evicting ZOMBIE: ${zombie.substring(0, 8)}…`);
        destroyEngine(zombie);
        return;
    }

    // Priority 2: Oldest idle engine (no active streams)
    let oldest = null;
    let oldestTime = Infinity;
    for (const key of keys) {
        if (activeEngines[key].activeStreams === 0 && activeEngines[key].lastAccess < oldestTime) {
            oldestTime = activeEngines[key].lastAccess;
            oldest = key;
        }
    }
    if (oldest) {
        console.log(`[Engine] Evicting oldest idle engine: ${oldest.substring(0, 8)}…`);
        destroyEngine(oldest);
        return;
    }

    // Priority 3: Force eviction of slowest engine if in HIGH memory modes
    const critical = limits.mode === 'EMERGENCY' || limits.mode === 'CRITICAL' || overRam;
    if (critical) {
        let slowest = null;
        let slowestSpeed = Infinity;
        for (const key of keys) {
            const avg = activeEngines[key].speedSamples?.reduce((a, b) => a + b, 0) / (activeEngines[key].speedSamples?.length || 1);
            if (avg < slowestSpeed) { slowestSpeed = avg; slowest = key; }
        }
        if (slowest) {
            console.log(`[Engine] 🚨 FORCED EVICTION (${limits.mode}): ${slowest.substring(0, 8)}… (avg ${slowestSpeed.toFixed(2)} MB/s)`);
            destroyEngine(slowest, true);
        }
    }
}

function destroyEngine(infoHash, force = false) {
    const entry = activeEngines[infoHash];
    if (!entry) return;

    // If there are active streams, don't destroy unless forced (emergency)
    if (entry.activeStreams > 0 && !force) {
        console.log(`[Engine] Postponing destruction for ${infoHash.substring(0, 8)}: ${entry.activeStreams} active streams`);
        resetEngineTimeout(infoHash);
        return;
    }

    clearTimeout(entry.timeout);
    if (entry.logInterval) clearInterval(entry.logInterval);
    delete activeEngines[infoHash];
    console.log(`[Engine] Destroying: ${infoHash.substring(0, 8)}… (active: ${Object.keys(activeEngines).length})`);

    // engine.remove() tears down connections AND deletes /tmp disk cache
    // This is critical to prevent /tmp from growing unboundedly and OOM-killing Render
    try {
        entry.engine.remove(false, (err) => {
            if (err) {
                // Fallback: just destroy swarm, disk cleanup may have failed
                try { entry.engine.destroy(); } catch (e) { /* ignore */ }
            }
            console.log(`[Engine] 🗑️ Disk cache purged: ${infoHash.substring(0, 8)}…`);
        });
    } catch (e) {
        try { entry.engine.destroy(); } catch (e2) { /* ignore */ }
    }
}

function resetEngineTimeout(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;
    entry.lastAccess = Date.now();
    clearTimeout(entry.timeout);

    // Dynamic Timeout: 10 mins if actively watching, but 3 minutes if abandoned (0 active streams)
    const duration = entry.activeStreams > 0 ? ENGINE_TIMEOUT : 3 * 60 * 1000;

    entry.timeout = setTimeout(() => {
        if (entry.activeStreams === 0 && duration < ENGINE_TIMEOUT) {
            console.log(`[Engine] Terminated abandoned stream ${infoHash.substring(0, 8)}… (0 active streams for 3m)`);
        }
        destroyEngine(infoHash);
    }, duration);
}

function getOrCreateEngine(infoHash) {
    if (activeEngines[infoHash]) {
        resetEngineTimeout(infoHash);
        return { engine: activeEngines[infoHash].engine, isReady: activeEngines[infoHash].isReady };
    }

    // Evict if at capacity
    evictIfNeeded();

    const limits = getDynamicLimits(infoHash);
    const magnet = buildMagnet(infoHash);
    console.log(`[Engine] Creating new engine (${limits.label || limits.mode}, ${limits.connections}c): ${infoHash.substring(0, 8)}…`);

    const engine = torrentStream(magnet, {
        tmp: '/tmp/torrent-stream',
        connections: limits.connections,
        uploads: 0,                 // Do not upload to save bandwidth/CPU
        verify: false,              // skip piece hash verification to save massive CPU
        dht: true,                  // Use DHT
        tracker: true,              // Use trackers
        storage: createMemoryStorage(), // NO disk writes — pieces live in RAM only
    });

    const entry = {
        engine,
        isReady: false,
        activeStreams: 0,
        lastAccess: Date.now(),
        createdAt: Date.now(),
    };

    activeEngines[infoHash] = entry;
    resetEngineTimeout(infoHash);

    // ─── Dynamic Speed Manager ───────────────────────────
    entry.lastNonZeroSpeed = Date.now();
    entry.speedSamples = []; // rolling window of speed samples
    let slowPeerEvictionTick = 0;

    entry.logInterval = setInterval(() => {
        if (!engine.swarm) return;
        const speedBps = engine.swarm.downloadSpeed();
        const speedMb = (speedBps / 1024 / 1024).toFixed(2);
        const peers = engine.swarm.wires.length;
        const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(2);

        // Track meaningful speed for zombie detection (floor: 0.1 MB/s = meaningful activity)
        if (parseFloat(speedMb) >= 0.1) {
            entry.lastNonZeroSpeed = Date.now();
        }

        // Rolling speed window (last 6 samples = 30s)
        entry.speedSamples.push(parseFloat(speedMb));
        if (entry.speedSamples.length > 6) entry.speedSamples.shift();
        const avgSpeed = entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length;

        // ── Hydra Brain: Per-engine weighted peer limit ──
        const currentLimits = getDynamicLimits(infoHash);

        // Dynamic Swarm Limit Sync + Recovery Re-announce
        const prevLimit = entry._prevPeerLimit || currentLimits.connections;
        if (engine.swarm.size !== currentLimits.connections) {
            engine.swarm.size = currentLimits.connections;
            if (engine.swarm.maxConnections) engine.swarm.maxConnections = currentLimits.connections;
        }

        // Only re-announce if budget jumped significantly (+10c) AND cooldown (30s) passed
        // Prevents noisy re-announces from minor budget oscillations (e.g. 38c -> 40c)
        const budgetJump = currentLimits.connections - prevLimit;
        const timeSinceAnnounce = Date.now() - (entry._lastAnnounce || 0);
        const needsMorePeers = peers < Math.floor(currentLimits.connections * 0.5); // below 50% utilization
        if (budgetJump >= 10 && timeSinceAnnounce > 30000 && needsMorePeers) {
            try {
                if (engine.swarm?.announce) engine.swarm.announce();
                if (engine.discovery?.lookup) engine.discovery.lookup();
                // Also poke the swarm to reconnect its pending queue
                if (engine.swarm?.resume) engine.swarm.resume();
                entry._lastAnnounce = Date.now();
                console.log(`[SpeedMgr:${infoHash.substring(0, 8)}] 📡 Peer Recovery: budget +${budgetJump}c (${prevLimit}c ➞ ${currentLimits.connections}c), peers: ${peers}`);
            } catch (e) { /* ignore */ }
        }
        entry._prevPeerLimit = currentLimits.connections;

        if (peers > currentLimits.connections) {
            const ram = getRamUsageMB();
            // Prune if RAM is pressured or if we are way over the limit
            if (ram > 120 || peers > currentLimits.connections + 5) {
                const excessCount = peers - currentLimits.connections;
                // Sort by speed: slowest first, BUT protect high-value seeders (>0.2 MB/s)
                // High-value peers ALWAYS go to the end (never pruned first)
                const HOG_THRESHOLD = 0.2 * 1024 * 1024; // 0.2 MB/s = high value
                const sortedWires = [...engine.swarm.wires].sort((a, b) => {
                    const spdA = a.downloadSpeed ? a.downloadSpeed() : 0;
                    const spdB = b.downloadSpeed ? b.downloadSpeed() : 0;
                    const aIsValuable = spdA >= HOG_THRESHOLD ? 1 : 0;
                    const bIsValuable = spdB >= HOG_THRESHOLD ? 1 : 0;
                    // Valuable seeds sink to bottom (protected), slow peers float to top
                    if (aIsValuable !== bIsValuable) return aIsValuable - bIsValuable;
                    return spdA - spdB; // among same tier: slowest first
                });

                let pruned = 0;
                for (let i = 0; i < excessCount; i++) {
                    if (sortedWires[i]) {
                        const spd = sortedWires[i].downloadSpeed ? sortedWires[i].downloadSpeed() : 0;
                        // Final safety: never kill a genuinely fast seeder
                        if (spd >= HOG_THRESHOLD) break;
                        try { sortedWires[i].destroy(); pruned++; } catch (e) { }
                    }
                }
                if (pruned > 0) {
                    console.log(`[SpeedMgr:${infoHash.substring(0, 8)}] ✂️ Pruned ${pruned} slow peers | ${currentLimits.label}`);
                }
            }
        }

        // ── Slow Peer Eviction (every 30s = 6 ticks) ──────
        slowPeerEvictionTick++;
        if (slowPeerEvictionTick >= 6) {
            slowPeerEvictionTick = 0;
            let evicted = 0;
            for (const wire of [...engine.swarm.wires]) {
                try {
                    const peerSpeed = wire.downloadSpeed ? wire.downloadSpeed() : 0;
                    // Evict peers that have been uploading 0 bytes and we have plenty of others
                    if (peerSpeed === 0 && peers > 10 && wire.peerChoking) {
                        wire.destroy();
                        evicted++;
                    }
                } catch (e) { /* ignore */ }
            }
            if (evicted > 0) {
                console.log(`[SpeedMgr:${infoHash.substring(0, 8)}] 🚫 Evicted ${evicted} slow peers`);
            }
        }

        // Log if active — include RAM so we can monitor memory pressure
        if (parseFloat(speedMb) > 0 || peers > 0) {
            const ramMB = getRamUsageMB();
            const ramWarn = ramMB > 180 ? ' ⚠️ RAM' : '';
            console.log(`[Engine:${infoHash.substring(0, 8)}] ⚡ ${speedMb} MB/s | 👥 ${peers} peers | 💾 ${downloaded} MB | avg:${avgSpeed.toFixed(2)} | 🧠 ${ramMB}MB${ramWarn}`);
        }
    }, 5000);

    // Proactive Memory Guard: Scan every 30s
    if (!global._zombieScannerStarted) {
        global._zombieScannerStarted = true;
        setInterval(() => {
            // Force eviction check if over limit
            if (getRamUsageMB() > RAM_LIMIT_MB) {
                console.log(`[Guard] Proactive RAM Check: ${getRamUsageMB()}MB exceeds ${RAM_LIMIT_MB}MB limit`);
                evictIfNeeded();
            }

            const zombieAge = ZOMBIE_TIMEOUT / 1000;
            for (const [hash, e] of Object.entries(activeEngines)) {
                const timeSinceGoodSpeed = Date.now() - (e.lastNonZeroSpeed || 0);
                const isStalled = timeSinceGoodSpeed > ZOMBIE_TIMEOUT;
                const noStreams = e.activeStreams === 0;

                if (noStreams && isStalled) {
                    const avgSpeed = e.speedSamples?.length
                        ? e.speedSamples.reduce((a, b) => a + b, 0) / e.speedSamples.length
                        : 0;
                    console.log(`[Zombie] Killing slow engine ${hash.substring(0, 8)}… (avg ${avgSpeed.toFixed(2)} MB/s for ${zombieAge}s)`);
                    destroyEngine(hash);
                } else if (e.activeStreams === 0 && e.speedSamples?.length >= 6) {
                    // Secondary check: if avg has been below 0.15 MB/s for all 6 samples (30s)
                    // AND engine is older than 2 minutes, try a DHT re-announce
                    const avgSpeed = e.speedSamples.reduce((a, b) => a + b, 0) / e.speedSamples.length;
                    const age = Date.now() - (e.createdAt || Date.now());
                    if (avgSpeed < 0.15 && age > 120000) {
                        try {
                            if (e.engine?.swarm?.announce) {
                                e.engine.swarm.announce();
                                console.log(`[SpeedMgr:${hash.substring(0, 8)}] 🔊 Re-announcing (avg ${avgSpeed.toFixed(2)} MB/s)`);
                            }
                        } catch (_) { /* ignore */ }
                    }
                }
            }
        }, 30 * 1000);
    }

    // Mark ready when the engine fires 'ready'
    engine.on('ready', () => {
        entry.isReady = true;
        console.log(`[Engine] Ready: ${infoHash.substring(0, 8)}… (${engine.files.length} files)`);

        // ── Priority: Deselect all, then select only the video ──
        engine.files.forEach(f => f.deselect());

        let bestFile = null;
        let bestSize = 0;
        for (const f of engine.files) {
            if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v'].some(e => f.name.toLowerCase().endsWith(e)) && f.length > bestSize) {
                bestFile = f;
                bestSize = f.length;
            }
        }

        if (bestFile) {
            bestFile.select();
            console.log(`[Engine] Priority → "${bestFile.name}" (${(bestFile.length / 1024 / 1024).toFixed(0)} MB)`);

            // ── Pre-buffer Warm-up: Read first 2MB to force download start ──
            setTimeout(() => {
                try {
                    const warmStream = bestFile.createReadStream({ start: 0, end: Math.min(2 * 1024 * 1024, bestFile.length - 1) });
                    warmStream.on('data', () => { }); // consume to drive the download
                    warmStream.on('end', () => console.log(`[SpeedMgr:${infoHash.substring(0, 8)}] 🔥 Pre-buffer complete`));
                    warmStream.on('error', () => { }); // ignore warm-up errors
                } catch (e) { /* ignore */ }
            }, 200); // slight delay to let file.select() take effect
        }
    });

    activeEngines[infoHash] = entry;
    return { engine, isReady: false };
}

// ─── Video file detection ────────────────────────────────
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

function isVideoFile(filename) {
    const lower = filename.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function findVideoFile(files, fileIdx) {
    if (fileIdx !== undefined && fileIdx !== null && files[fileIdx]) {
        return files[fileIdx];
    }

    let bestFile = null;
    let bestSize = 0;

    for (const file of files) {
        if (isVideoFile(file.name) && file.length > bestSize) {
            bestFile = file;
            bestSize = file.length;
        }
    }

    return bestFile;
}

// ─── Serve video file with Range support ─────────────────
function serveVideoFile(file, req, res, infoHash) {
    resetEngineTimeout(infoHash);

    const entry = activeEngines[infoHash];
    if (entry) entry.activeStreams++;

    req.on('close', () => {
        if (entry) {
            entry.activeStreams = Math.max(0, entry.activeStreams - 1);
            resetEngineTimeout(infoHash);
        }
    });

    const totalSize = file.length;

    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
        mp4: 'video/mp4',
        mkv: 'video/x-matroska',
        avi: 'video/x-msvideo',
        mov: 'video/quicktime',
        wmv: 'video/x-ms-wmv',
        flv: 'video/x-flv',
        webm: 'video/webm',
        m4v: 'video/mp4',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const rangeHeader = req.headers.range;

    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        console.log(`[Stream] Range: ${start}-${end}/${totalSize} (${(chunkSize / 1024 / 1024).toFixed(1)} MB)`);

        // Add connection keep-alive and disable cache to prevent buffering/drops
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Connection': 'keep-alive',
            'Cache-Control': 'no-store',
        });

        const stream = file.createReadStream({ start, end, highWaterMark: 4 * 1024 * 1024 });
        stream.pipe(res);
        stream.on('error', (err) => {
            console.error(`[Stream Error] ${infoHash.substring(0, 8)} Read error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        res.on('close', () => {
            stream.destroy();
        });
    } else {
        console.log(`[Stream] Full file: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

        // Add connection keep-alive and disable cache to prevent buffering/drops
        res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-store',
        });

        const stream = file.createReadStream({ highWaterMark: 4 * 1024 * 1024 });
        stream.pipe(res);
        stream.on('error', (err) => {
            console.error(`[Stream Error] ${infoHash.substring(0, 8)} Read error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        res.on('close', () => {
            stream.destroy();
        });
    }
}

// ─── Stream Proxy Route ─────────────────────────────────
app.get('/stream/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const fileIdx = req.query.fileIdx !== undefined ? parseInt(req.query.fileIdx, 10) : undefined;

    console.log(`[Stream] Request for ${infoHash.substring(0, 8)}… fileIdx=${fileIdx}`);

    const { engine, isReady } = getOrCreateEngine(infoHash);

    // Prevent MaxListeners warning — multiple concurrent requests to same engine
    engine.setMaxListeners(30);

    // If engine is already ready (cached), serve immediately
    if (isReady && engine.files && engine.files.length > 0) {
        console.log(`[Stream] Engine cached & ready, serving immediately`);
        const file = findVideoFile(engine.files, fileIdx);

        if (!file) {
            res.status(404).json({ error: 'No video file found in this torrent' });
            return;
        }

        console.log(`[Stream] Serving: "${file.name}" (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
        serveVideoFile(file, req, res, infoHash);
        return;
    }

    // Engine is new — wait for 'ready' event
    let responded = false;

    const onReady = () => {
        if (responded) return;
        responded = true;
        clearTimeout(timer);
        engine.removeListener('error', onError);

        const file = findVideoFile(engine.files, fileIdx);
        if (!file) {
            res.status(404).json({ error: 'No video file found in this torrent' });
            return;
        }

        console.log(`[Stream] Serving: "${file.name}" (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
        serveVideoFile(file, req, res, infoHash);
    };

    const onError = (err) => {
        console.error(`[Engine Error] ${err.message}`);
        if (!responded) {
            responded = true;
            clearTimeout(timer);
            engine.removeListener('ready', onReady);
            if (!res.headersSent) res.status(500).json({ error: 'Torrent engine error' });
        }
    };

    // Use once() to auto-remove after firing, preventing listener leak
    engine.once('ready', onReady);
    engine.once('error', onError);

    // Timeout
    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            engine.removeListener('ready', onReady);
            engine.removeListener('error', onError);
            console.error(`[Stream] Timeout (${CONNECT_TIMEOUT / 1000}s): ${infoHash.substring(0, 8)}…`);
            if (!res.headersSent) {
                res.status(504).json({ error: 'Torrent timed out — try a lower quality with more seeders' });
            }
        }
    }, CONNECT_TIMEOUT);

    // Clean up if client disconnects early
    req.on('close', () => {
        if (!responded) {
            responded = true;
            clearTimeout(timer);
            engine.removeListener('ready', onReady);
            engine.removeListener('error', onError);
        }
        console.log(`[Stream] Client disconnected: ${infoHash.substring(0, 8)}…`);
    });
});

// ─── Start Server ────────────────────────────────────────
app.listen(PORT, () => {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    console.log(`
╔══════════════════════════════════════════════════════╗
║             🎬 Torrent to weblink 🎬              ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Server running on port ${String(PORT).padEnd(28)}  ║
║                                                      ║
║  Manifest URL:                                       ║
║  ${(baseUrl + '/manifest.json').padEnd(52)}║
║                                                      ║
║  Install in Stremio:                                 ║
║  Open Stremio → Addons → paste the manifest URL      ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
});
