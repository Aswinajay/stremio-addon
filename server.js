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
        version: '4.0.0',
        dashboard: `https://${_req.get('host')}/dashboard`,
        activeEngines: Object.keys(activeEngines).length,
        maxEngines: 'Unlimited',
        ramUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
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
    res.json({ version: '4.0.0', results });
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
            .refresh { font-size: 0.8rem; color: #666; margin-bottom: 20px; }
        </style>
        <meta http-equiv="refresh" content="5">
    </head>
    <body>
        <h1>Live Stream Monitor</h1>
        <div class="refresh">Auto-refreshing every 5 seconds. Active Engines: ${engines.length} / Unlimited</div>
        <div class="grid">
            ${engines.length ? engines.map(e => `
                <div class="card">
                    <div><b>Engine ID:</b> ${e.id}</div>
                    <div><b>Status:</b> ${e.ready ? 'Ready' : 'Connecting'}</div>
                    <div><b>Active Streams:</b> <span class="stat">${e.activeStreams}</span></div>
                    <div><b>Speed:</b> <span class="stat">${e.speed}</span></div>
                    <div><b>Peers:</b> ${e.peers}</div>
                    <div><b>Downloaded:</b> ${e.downloaded}</div>
                    <div><b>Files:</b> ${e.files}</div>
                    <div><b>Last Activity:</b> ${e.lastAccess}</div>
                </div>
            `).join('') : '<div class="card">No active streams. Start watching something in Stremio!</div>'}
        </div>
        <div style="margin-top: 30px;"><a href="/" style="color: #666; font-size: 0.9rem;">Back to Landing Page</a></div>
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
            .btn:hover::after { left: 150%; }
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
            .link:hover { color: #a78bfa; }
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
                The ultimate Stremio addon. Experience flawless, buffer-free 4K & HDR streaming with an intelligent cloud proxy.
            </p>
            <a href="${installUrl}" class="btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                Install in Stremio
            </a>

            <div class="btn-links">
                <a href="/dashboard" class="link">Live Monitor</a>
                <a href="https://github.com/Aswinajay/stremio-addon" target="_blank" class="link">GitHub</a>
                <a href="https://www.buymeacoffee.com/withaswin" target="_blank" class="link">Support Me</a>
            </div>

            <div class="features">
                <div class="feature">Unlimited Resources</div>
                <div class="feature">50+ Torrent Sources</div>
                <div class="feature">4K HDR Streaming</div>
                <div class="feature">No Throttling</div>
                <div class="feature">DHT + PEX + Trackers</div>
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
// NO limits — unlimited connections, unlimited engines, no eviction
const activeEngines = {};
const CONNECT_TIMEOUT = 120000; // 2 min timeout for slow torrents

// ─── Massive Tracker List ────────────────────────────────
function getTrackers() {
    return [
        // === Tier 1: Highest traffic ===
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

        // === Tier 2: Best list ===
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

        // === Tier 3: Extended UDP ===
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

        // === Tier 4: HTTPS (bypass UDP blocks) ===
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

        // === Tier 5: Additional high-performance trackers ===
        'udp://open.tracker.cl:1337/announce',
        'udp://open.trackerlist.xyz:80/announce',
        'udp://open.free-tracker.ga:6969/announce',
        'udp://tracker.openbtba.com:6969/announce',
        'udp://tracker.nighthawk.pw:443/announce',
        'udp://tracker.kuroy.me:5555/announce',
        'udp://tracker.jamesthebard.net:2169/announce',
        'udp://tracker.justseed.it:1337/announce',
        'udp://tracker.harbinger.tk:6969/announce',
        'udp://tracker.frozenporn.xyz:2710/announce',
        'udp://tracker.fosstorrents.com:6969/announce',
        'udp://tracker.damageyourhigh.com:3630/announce',
        'udp://tracker.babico.name.tr:8008/announce',
        'udp://tracker.anirena.com:80/announce',
        'udp://tracker-alt.1337x.org:80/announce',
        'udp://tcprxy.com:6969/announce',
        'udp://t1.leech.ie:6969/announce',
        'udp://t2.leech.ie:6969/announce',
        'udp://t3.leech.ie:6969/announce',
        'udp://shadowshq.yi.org:6969/announce',
        'udp://racker.lusty.cat:5555/announce',
        'udp://publictracker.xyz:6969/announce',
        'udp://public.publictracker.xyz:6969/announce',
        'udp://inferno.demonoid.is:3391/announce',
        'udp://denis.stalker.upeer.me:6969/announce',
        'udp://concen.org:6969/announce',
        'udp://chouchou.top:8080/announce',
        'udp://aegir.sexy:6969/announce',

        // === Tier 6: WebSeed + Magnet URI extensions ===
        'udp://v1040.ml:1337/announce',
        'udp://vps2.avc.cx:7171/announce',
        'udp://vps02.net.orel.ru:80/announce',
        'udp://ui.lv:9337/announce',
        'udp://u.wwbbs.top:6969/announce',
        'udp://tracker2.itzmx.com:6961/announce',
        'udp://tracker2.dler.org:80/announce',
        'udp://tracker0.ufibox.com:6969/announce',
        'udp://tracker.ygsub.com:6969/announce',
        'udp://tracker.xf-sub.com:6969/announce',
        'udp://tracker.wudizu.top:80/announce',
        'udp://tracker.winton.net:80/announce',
        'udp://tracker.xyz paral-barsel.com:6969/announce',
    ];
}

// ─── DHT Bootstrap Nodes ─────────────────────────────────
function getDhtBootstrapNodes() {
    return [
        'router.bittorrent.com:6881',
        'router.utorrent.com:6881',
        'dht.transmissionbt.com:6881',
        'dht.aelitis.com:6881',
        'router.bitcomet.com:6881',
        'dht.libtorrent.org:25401',
    ];
}

function buildMagnet(infoHash, name) {
    const trackers = getTrackers();
    const trackerParams = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    const dn = name ? `&dn=${encodeURIComponent(name)}` : '';
    return `magnet:?xt=urn:btih:${infoHash}${dn}${trackerParams}`;
}

// ─── Engine Cleanup (only on explicit disconnect, no forced eviction) ───
function destroyEngine(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;

    if (entry.activeStreams > 0) {
        console.log(`[Engine] Keeping alive: ${infoHash.substring(0, 8)} — ${entry.activeStreams} active streams`);
        return;
    }

    clearTimeout(entry.timeout);
    if (entry.logInterval) clearInterval(entry.logInterval);
    delete activeEngines[infoHash];
    console.log(`[Engine] Destroyed: ${infoHash.substring(0, 8)} (active: ${Object.keys(activeEngines).length})`);

    try {
        entry.engine.remove(true, (err) => {
            if (err) {
                try { entry.engine.destroy(); } catch (e) { /* ignore */ }
            }
            console.log(`[Engine] Resources flushed: ${infoHash.substring(0, 8)}`);
        });
    } catch (e) {
        try { entry.engine.destroy(); } catch (e2) { /* ignore */ }
    }
}

function scheduleCleanup(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;
    entry.lastAccess = Date.now();
    clearTimeout(entry.timeout);
    // Clean up idle engines after 15 minutes of no activity
    entry.timeout = setTimeout(() => {
        if (entry.activeStreams === 0) {
            console.log(`[Engine] Idle cleanup: ${infoHash.substring(0, 8)}`);
            destroyEngine(infoHash);
        }
    }, 15 * 60 * 1000);
}

function getOrCreateEngine(infoHash, torrentName) {
    if (activeEngines[infoHash]) {
        scheduleCleanup(infoHash);
        return { engine: activeEngines[infoHash].engine, isReady: activeEngines[infoHash].isReady };
    }

    const magnet = buildMagnet(infoHash, torrentName);
    console.log(`[Engine] Creating: ${infoHash.substring(0, 8)} — unlimited connections, DHT + PEX + ${getTrackers().length} trackers`);

    const engine = torrentStream(magnet, {
        tmp: '/tmp/torrent-stream',
        connections: 500,           // Maximum peer connections
        uploads: 4,                 // Allow uploading for better ratio
        verify: false,              // Skip piece hash verification to save CPU
        dht: true,                  // DHT enabled
        tracker: true,              // Trackers enabled
        // Unique port per engine — sharing one port breaks DHT binding
        // for every engine after the first, killing peer discovery
        port: 30000 + ((globalThis.__engineCounter = (globalThis.__engineCounter || 0) + 1) % 20000),
    });

    const entry = {
        engine,
        isReady: false,
        activeStreams: 0,
        lastAccess: Date.now(),
        createdAt: Date.now(),
    };

    activeEngines[infoHash] = entry;
    scheduleCleanup(infoHash);

    // ─── Engine Monitoring (no throttling, just stats) ───────
    entry.logInterval = setInterval(() => {
        if (!engine.swarm) return;
        const speedBps = engine.swarm.downloadSpeed();
        const speedMb = (speedBps / 1024 / 1024).toFixed(2);
        const peers = engine.swarm.wires.length;
        const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(2);
        const ramMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

        if (parseFloat(speedMb) > 0 || peers > 0) {
            console.log(`[Engine:${infoHash.substring(0, 8)}] ${speedMb} MB/s | ${peers} peers | ${downloaded} MB | ${entry.activeStreams} streams | RAM: ${ramMB}MB`);
        }
    }, 10000);

    // ─── Engine Ready ────────────────────────────────────
    engine.on('ready', () => {
        entry.isReady = true;
        console.log(`[Engine] Ready: ${infoHash.substring(0, 8)} (${engine.files.length} files, ${engine.swarm.wires.length} peers)`);

        // Deselect all files, then select only the largest video
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
            console.log(`[Engine] Priority -> "${bestFile.name}" (${(bestFile.length / 1024 / 1024).toFixed(0)} MB)`);

            // Pre-buffer: Read first 5MB to force download start
            setTimeout(() => {
                try {
                    const warmStream = bestFile.createReadStream({ start: 0, end: Math.min(5 * 1024 * 1024, bestFile.length - 1) });
                    warmStream.on('data', () => { });
                    warmStream.on('end', () => console.log(`[Engine:${infoHash.substring(0, 8)}] Pre-buffer complete`));
                    warmStream.on('error', () => { });
                } catch (e) { /* ignore */ }
            }, 300);
        }
    });

    return { engine, isReady: false };
}

// ─── Video file detection ────────────────────────────────
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

function isVideoFile(filename) {
    const lower = filename.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function findVideoFile(files, fileIdx) {
    if (fileIdx !== undefined && fileIdx !== null && files[fileIdx]) return files[fileIdx];

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
    scheduleCleanup(infoHash);

    const entry = activeEngines[infoHash];
    if (entry) entry.activeStreams++;

    req.on('close', () => {
        if (entry) {
            entry.activeStreams = Math.max(0, entry.activeStreams - 1);
            scheduleCleanup(infoHash);
        }
    });

    const totalSize = file.length;
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
        mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
        mov: 'video/quicktime', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
        webm: 'video/webm', m4v: 'video/mp4',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        console.log(`[Stream] Range: ${start}-${end}/${totalSize} (${(chunkSize / 1024 / 1024).toFixed(1)} MB)`);

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Connection': 'keep-alive',
            'Cache-Control': 'no-store',
        });

        const stream = file.createReadStream({ start, end, highWaterMark: 8 * 1024 * 1024 });
        stream.pipe(res);
        stream.on('error', (err) => {
            console.error(`[Stream Error] ${infoHash.substring(0, 8)}: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        res.on('close', () => stream.destroy());
    } else {
        console.log(`[Stream] Full file: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

        res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-store',
        });

        const stream = file.createReadStream({ highWaterMark: 8 * 1024 * 1024 });
        stream.pipe(res);
        stream.on('error', (err) => {
            console.error(`[Stream Error] ${infoHash.substring(0, 8)}: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        res.on('close', () => stream.destroy());
    }
}

// ─── Stream Proxy Route ─────────────────────────────────
app.get('/stream/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const fileIdx = req.query.fileIdx !== undefined ? parseInt(req.query.fileIdx, 10) : undefined;

    console.log(`[Stream] Request for ${infoHash.substring(0, 8)} fileIdx=${fileIdx}`);

    const { engine, isReady } = getOrCreateEngine(infoHash);

    engine.setMaxListeners(50);

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

    engine.once('ready', onReady);
    engine.once('error', onError);

    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            engine.removeListener('ready', onReady);
            engine.removeListener('error', onError);
            console.error(`[Stream] Timeout (${CONNECT_TIMEOUT / 1000}s): ${infoHash.substring(0, 8)}`);
            if (!res.headersSent) {
                res.status(504).json({ error: 'Torrent timed out — try a torrent with more seeders' });
            }
        }
    }, CONNECT_TIMEOUT);

    req.on('close', () => {
        if (!responded) {
            responded = true;
            clearTimeout(timer);
            engine.removeListener('ready', onReady);
            engine.removeListener('error', onError);
        }
        console.log(`[Stream] Client disconnected: ${infoHash.substring(0, 8)}`);
    });
});

// ─── Start Server ────────────────────────────────────────
app.listen(PORT, () => {
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    console.log(`
╔══════════════════════════════════════════════════════╗
║             Torrent to weblink v4.0.0              ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Server running on port ${String(PORT).padEnd(28)}  ║
║                                                      ║
║  Manifest URL:                                       ║
║  ${(baseUrl + '/manifest.json').padEnd(52)}║
║                                                      ║
║  Install in Stremio:                                 ║
║  Open Stremio -> Addons -> paste the manifest URL    ║
║                                                      ║
║  NO LIMITS: Unlimited connections & engines          ║
║  100+ trackers | DHT | PEX | No throttling          ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
});
