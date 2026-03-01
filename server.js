const express = require('express');
const cors = require('cors');
const torrentStream = require('torrent-stream');
const addonInterface = require('./addon');
const { getRouter } = require('stremio-addon-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ────────────────────────────────────────────────
app.use(cors());

// ─── Health check ────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        version: '2.5.0',
        activeEngines: Object.keys(activeEngines).length,
        maxEngines: MAX_ENGINES,
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
    res.json({ version: '2.5.0', results });
});

// ─── Landing Page ────────────────────────────────────────
app.get('/', (req, res) => {
    const host = req.get('host') || 'stremio-addon-lg01.onrender.com';
    const installUrl = `stremio://${host}/manifest.json`;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Buffer-Free Stremio Addon</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #121212;
                color: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
            }
            .container {
                max-width: 600px;
                padding: 40px;
                background: linear-gradient(145deg, #1e1e1e, #141414);
                border-radius: 20px;
                box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
                border: 1px solid #333;
            }
            h1 {
                margin-top: 0;
                font-size: 2.5rem;
                background: -webkit-linear-gradient(45deg, #8a2be2, #4b0082);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            p {
                font-size: 1.1rem;
                line-height: 1.6;
                color: #b3b3b3;
                margin-bottom: 30px;
            }
            .btn {
                display: inline-block;
                background-color: #8b5cf6;
                color: white;
                text-decoration: none;
                padding: 15px 40px;
                font-size: 1.2rem;
                font-weight: bold;
                border-radius: 50px;
                transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
                box-shadow: 0 5px 15px rgba(139, 92, 246, 0.4);
            }
            .btn:hover {
                transform: translateY(-2px);
                background-color: #7c3aed;
                box-shadow: 0 8px 20px rgba(139, 92, 246, 0.6);
            }
            .features {
                display: flex;
                justify-content: center;
                gap: 20px;
                margin-top: 30px;
            }
            .feature {
                background: #2a2a2a;
                padding: 10px 20px;
                border-radius: 10px;
                font-size: 0.9rem;
                color: #d1d5db;
                border: 1px solid #3d3d3d;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Buffer-Free Server</h1>
            <p>
                This exclusive Stremio addon proxies massive 4K & HD torrents through a high-speed cloud server, completely eliminating buffering and stuttering on low-end devices.
            </p>
            <a href="${installUrl}" class="btn">🚀 Install in Stremio</a>
            
            <div class="features">
                <div class="feature">⚡ Cloud Proxy</div>
                <div class="feature">🎬 25+ Massive Sources</div>
                <div class="feature">🍿 SolidTorrents & Nyaa</div>
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
const MAX_ENGINES = 3;
const ENGINE_TIMEOUT = 5 * 60 * 1000; // 5 min idle
const CONNECT_TIMEOUT = 60000; // 60s to connect to torrent
const activeEngines = {};

function getTrackers() {
    return [
        'udp://tracker.opentrackr.org:1337/announce',
        'http://tracker.opentrackr.org:1337/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://open.stealth.si:80/announce',
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
        'udp://t.overflow.biz:6969/announce',
        'udp://retracker.lanta.me:2710/announce',
        'udp://opentracker.io:6969/announce',
        'udp://open.dstud.io:6969/announce',
        'udp://ns575949.ip-51-222-82.net:6969/announce',
        'udp://martin-gebhardt.eu:25/announce',
        'udp://leet-tracker.moe:1337/announce',
        'udp://explodie.org:6969/announce',
        'udp://evan.im:6969/announce',
        'udp://d40969.acod.regrucolo.ru:6969/announce',
        'udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce',
        'udp://bandito.byterunner.io:6969/announce',
        'udp://6ahddutb1ucc3cp.ru:6969/announce',
        'https://tracker.zhuqiy.com:443/announce',
        'https://tracker.pmman.tech:443/announce',
        'https://tracker.moeking.me:443/announce',
        'https://tracker.iperson.xyz:443/announce',
        'https://tracker.ghostchu-services.top:443/announce',
        'https://tracker.bt4g.com:443/announce',
        'https://tr.zukizuki.org:443/announce',
        'https://tr.nyacat.pw:443/announce',
        'http://www.torrentsnipe.info:2701/announce',
        'http://www.genesis-sp.org:2710/announce',
        'http://tracker810.xyz:11450/announce',
        'http://tracker2.dler.org:80/announce',
        'http://tracker.zhuqiy.com:80/announce',
        'http://tracker.waaa.moe:6969/announce',
        'http://tracker.vanitycore.co:6969/announce',
        'http://tracker.tritan.gg:8080/announce'
    ];
}

function buildMagnet(infoHash) {
    const trackers = getTrackers();
    const trackerParams = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}${trackerParams}`;
}

function evictIfNeeded() {
    const keys = Object.keys(activeEngines);
    if (keys.length < MAX_ENGINES) return;

    let oldest = null;
    let oldestTime = Infinity;
    for (const key of keys) {
        if (activeEngines[key].lastAccess < oldestTime) {
            oldestTime = activeEngines[key].lastAccess;
            oldest = key;
        }
    }

    if (oldest) {
        console.log(`[Engine] Evicting idle engine: ${oldest.substring(0, 8)}…`);
        destroyEngine(oldest);
    }
}

function destroyEngine(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;

    clearTimeout(entry.timeout);
    if (entry.logInterval) clearInterval(entry.logInterval);
    try {
        entry.engine.destroy();
    } catch (e) {
        // ignore
    }
    delete activeEngines[infoHash];
    console.log(`[Engine] Destroyed: ${infoHash.substring(0, 8)}… (active: ${Object.keys(activeEngines).length})`);
}

function getOrCreateEngine(infoHash) {
    if (activeEngines[infoHash]) {
        const entry = activeEngines[infoHash];
        entry.lastAccess = Date.now();

        // Reset idle timeout
        clearTimeout(entry.timeout);
        entry.timeout = setTimeout(() => destroyEngine(infoHash), ENGINE_TIMEOUT);

        return { engine: entry.engine, isReady: entry.isReady };
    }

    // Evict if at capacity
    evictIfNeeded();

    const magnet = buildMagnet(infoHash);
    console.log(`[Engine] Creating new engine: ${infoHash.substring(0, 8)}…`);

    const engine = torrentStream(magnet, {
        tmp: '/tmp/torrent-stream',
        connections: 110,           // Optimal connections to find fast peers without exhausting Render's CPU limit
        uploads: 0,                 // Do not upload to save bandwidth/CPU
        verify: false,              // Skip piece hash verification to save massive CPU 
        dht: true,                  // Use DHT
        tracker: true               // Use trackers
    });

    const entry = {
        engine,
        isReady: false,
        lastAccess: Date.now(),
        timeout: setTimeout(() => destroyEngine(infoHash), ENGINE_TIMEOUT),
    };

    // Log speed every 5 seconds
    entry.logInterval = setInterval(() => {
        if (!engine.swarm) return;
        const speed = (engine.swarm.downloadSpeed() / 1024 / 1024).toFixed(2);
        const peers = engine.swarm.wires.length;
        const downloaded = (engine.swarm.downloaded / 1024 / 1024).toFixed(2);

        // Only log if it's actually doing something
        if (speed > 0 || peers > 0) {
            console.log(`[Engine:${infoHash.substring(0, 8)}] ⚡ ${speed} MB/s | 👥 ${peers} peers | 💾 ${downloaded} MB`);
        }
    }, 5000);

    // Mark ready when the engine fires 'ready'
    engine.on('ready', () => {
        entry.isReady = true;
        console.log(`[Engine] Ready: ${infoHash.substring(0, 8)}… (${engine.files.length} files)`);
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

        const stream = file.createReadStream({ start, end });
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

        const stream = file.createReadStream();
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
║         🎬 Render Torrent Stream Addon 🎬            ║
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
