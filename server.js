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
        version: '1.4.0',
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
    res.json({ version: '1.4.0', results });
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
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://open.stealth.si:80/announce',
        'https://tracker.tamersunion.org:443/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://public.popcorn-tracker.org:6969/announce',
        'udp://exodus.desync.com:6969',
        'https://torrent.tracker.durukanbal.com:443/announce',
        'https://cny.fan:443/announce',
        'udp://utracker.ghostchu-services.top:6969/announce',
        'udp://tracker.tvunderground.org.ru:3218/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker.t-1.org:6969/announce',
        'udp://tracker.plx.im:6969/announce',
        'udp://opentor.net:6969/announce',
        'http://tracker.opentrackr.org:1337/announce',
        'http://tracker.openbittorrent.com:80/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
        'udp://tracker.leechers-paradise.org:6969/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
        'udp://tracker.tiny-vps.com:6969/announce'
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
        connections: 200,           // More connections to find fast peers
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
            console.error(`[Stream] Read error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
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
            console.error(`[Stream] Read error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
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
