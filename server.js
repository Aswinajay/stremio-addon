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
        version: '3.2.0',
        dashboard: `https://${_req.get('host')}/dashboard`,
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
    res.json({ version: '3.2.0', results });
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
            h1 { color: #8b5cf6; }
            .refresh { font-size: 0.8rem; color: #666; margin-bottom: 20px; }
        </style>
        <meta http-equiv="refresh" content="5">
    </head>
    <body>
        <h1>📊 Live Stream Monitor</h1>
        <div class="refresh">Auto-refreshing every 5 seconds. Active Engines: ${engines.length} / ${MAX_ENGINES}</div>
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
            <div style="margin-top: 15px;">
                <a href="/dashboard" style="color: #8b5cf6; text-decoration: none; font-size: 0.9rem;">📊 Live Stream Monitor</a>
            </div>
            
            <div class="features">
                <div class="feature">⚡ Cloud Proxy</div>
                <div class="feature">🎬 30+ Massive Sources</div>
                <div class="feature">📺 Official Tio & Bitsearch</div>
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
const ENGINE_TIMEOUT = 10 * 60 * 1000; // 10 min idle
const CONNECT_TIMEOUT = 120000; // 120s to connect to torrent (Render cold peers are slow)
const ZOMBIE_TIMEOUT = 3 * 60 * 1000; // 3 min at 0 speed with no active streams = Zombie
const activeEngines = {};

function getTrackers() {
    return [
        'udp://tracker.opentrackr.org:1337/announce',
        'http://tracker.opentrackr.org:1337/announce',
        'udp://9.rarbg.com:2810/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'http://tracker.openbittorrent.com:80/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://www.torrent.eu.org:451/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker.srv00.com:6969/announce',
        'udp://tracker.publictracker.xyz:6969/announce',
        'udp://tracker.moeking.me:6969/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
        'udp://tracker.halfshit.cf:6969/announce',
        'udp://tracker.cyberia.is:6969/announce',
        'udp://tracker.birkenwald.de:6969/announce',
        'udp://tracker.auctor.tv:6969/announce',
        'udp://retracker.lanta.me:2710/announce',
        'udp://open.stealth.si:80/announce',
        'udp://explodie.org:6969/announce',
        'udp://bt1.archive.org:6969/announce',
        'udp://bt2.archive.org:6969/announce',
        'https://tracker.zhuqiy.com:443/announce',
        'https://tracker.tamersunion.org:443/announce',
        'https://tracker.nanoha.org:443/announce',
        'https://tracker.lilithraws.org:443/announce',
        'https://tr.hostux.net:443/announce',
        'http://t.overflow.biz:6969/announce',
        'udp://tracker.v6speed.org:6969/announce',
        'udp://tracker.uw0.xyz:6969/announce',
        'udp://tracker.shkinev.me:6969/announce',
        'udp://tracker.ryke.info:6969/announce',
        'udp://tracker.oilid.ru:6969/announce',
        'udp://tracker.mkg.hk:6969/announce',
        'udp://tracker.kicks-ass.net:80/announce',
        'udp://tracker.irxh.net:1337/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://tracker.ds.is:6969/announce',
        'udp://tracker.bitsearch.to:1337/announce',
        'udp://tracker.bt4g.com:2095/announce',
        'udp://tracker.monitorit4.me:6969/announce',
        'udp://tracker.army:6969/announce'
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

    // Prefer evicting ZOMBIE engines (0 speed, 0 active streams) first
    const zombie = keys.find(k => {
        const e = activeEngines[k];
        return e.activeStreams === 0 && e.lastNonZeroSpeed && (Date.now() - e.lastNonZeroSpeed > ZOMBIE_TIMEOUT);
    });

    if (zombie) {
        console.log(`[Engine] Evicting ZOMBIE engine: ${zombie.substring(0, 8)}… (0 speed for 90s)`);
        destroyEngine(zombie);
        return;
    }

    // Fallback: evict the oldest accessed engine
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
    }
}

function destroyEngine(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;

    // If there are active streams, don't destroy, just reschedule
    if (entry.activeStreams > 0) {
        console.log(`[Engine] Postponing destruction for ${infoHash.substring(0, 8)}: ${entry.activeStreams} active streams`);
        resetEngineTimeout(infoHash);
        return;
    }

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

function resetEngineTimeout(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;
    entry.lastAccess = Date.now();
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => destroyEngine(infoHash), ENGINE_TIMEOUT);
}

function getOrCreateEngine(infoHash) {
    if (activeEngines[infoHash]) {
        resetEngineTimeout(infoHash);
        return { engine: activeEngines[infoHash].engine, isReady: activeEngines[infoHash].isReady };
    }

    // Evict if at capacity
    evictIfNeeded();

    const magnet = buildMagnet(infoHash);
    console.log(`[Engine] Creating new engine: ${infoHash.substring(0, 8)}…`);

    const engine = torrentStream(magnet, {
        tmp: '/tmp/torrent-stream',
        connections: 50,           // Nitro Push: More connections to find Premium High-Speed seeders
        uploads: 0,                 // Do not upload to save bandwidth/CPU
        verify: false,              // skip piece hash verification to save massive CPU 
        dht: true,                  // Use DHT
        tracker: true               // Use trackers
    });

    const entry = {
        engine,
        isReady: false,
        activeStreams: 0,
        lastAccess: Date.now(),
        timeout: setTimeout(() => destroyEngine(infoHash), ENGINE_TIMEOUT),
    };

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

        // Track non-zero speed for zombie detection
        if (parseFloat(speedMb) > 0) {
            entry.lastNonZeroSpeed = Date.now();
        }

        // Rolling speed window (last 6 samples = 30s)
        entry.speedSamples.push(parseFloat(speedMb));
        if (entry.speedSamples.length > 6) entry.speedSamples.shift();
        const avgSpeed = entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length;

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

        // Log if active
        if (parseFloat(speedMb) > 0 || peers > 0) {
            console.log(`[Engine:${infoHash.substring(0, 8)}] ⚡ ${speedMb} MB/s | 👥 ${peers} peers | 💾 ${downloaded} MB | avg:${avgSpeed.toFixed(2)}`);
        }
    }, 5000);

    // Global zombie scan every 90s
    if (!global._zombieScannerStarted) {
        global._zombieScannerStarted = true;
        setInterval(() => {
            const zombieAge = ZOMBIE_TIMEOUT / 1000;
            for (const [hash, e] of Object.entries(activeEngines)) {
                if (e.activeStreams === 0 && e.lastNonZeroSpeed && (Date.now() - e.lastNonZeroSpeed > ZOMBIE_TIMEOUT)) {
                    console.log(`[Zombie] Killing stalled engine ${hash.substring(0, 8)}… (0 MB/s for ${zombieAge}s)`);
                    destroyEngine(hash);
                }
            }
        }, 90 * 1000);
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
