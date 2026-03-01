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
        version: '1.2.0',
        activeEngines: Object.keys(activeEngines).length,
        maxEngines: MAX_ENGINES,
        uptime: process.uptime(),
    });
});

// ─── Debug: test API connectivity ────────────────────────
const axios = require('axios');
app.get('/debug', async (_req, res) => {
    const results = {};

    // Test YTS
    for (const mirror of ['https://yts.torrentbay.st', 'https://movies-api.accel.li', 'https://yts.autos']) {
        try {
            const url = `${mirror}/api/v2/movie_details.json?imdb_id=tt1375666`;
            const r = await axios.get(url, { timeout: 10000 });
            const torrents = r.data?.data?.movie?.torrents?.length || 0;
            results[mirror] = { status: 'ok', torrents };
        } catch (err) {
            results[mirror] = { status: 'error', message: err.message, code: err.response?.status };
        }
    }

    // Test EZTV
    try {
        const url = 'https://eztvx.to/api/get-torrents?imdb_id=0944947&limit=5';
        const r = await axios.get(url, { timeout: 10000 });
        const torrents = r.data?.torrents?.length || 0;
        results['eztv'] = { status: 'ok', torrents };
    } catch (err) {
        results['eztv'] = { status: 'error', message: err.message, code: err.response?.status };
    }

    res.json({ version: '1.2.0', results });
});

// ─── Stremio Addon SDK routes ────────────────────────────
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

// ─── Torrent Engine Management ───────────────────────────
const MAX_ENGINES = 3; // Keep memory under 512MB
const ENGINE_TIMEOUT = 5 * 60 * 1000; // 5 min idle timeout
const activeEngines = {};

function getTrackers() {
    return [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://public.popcorn-tracker.org:6969/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://exodus.desync.com:6969',
        'udp://open.demonii.com:1337/announce',
    ];
}

function buildMagnet(infoHash) {
    const trackers = getTrackers();
    const trackerParams = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}${trackerParams}`;
}

// Evict least-recently-used engine if at capacity
function evictIfNeeded() {
    const keys = Object.keys(activeEngines);
    if (keys.length < MAX_ENGINES) return;

    // Find the one with the oldest lastAccess
    let oldest = null;
    let oldestTime = Infinity;
    for (const key of keys) {
        if (activeEngines[key].lastAccess < oldestTime) {
            oldestTime = activeEngines[key].lastAccess;
            oldest = key;
        }
    }

    if (oldest) {
        console.log(`[Engine] Evicting idle engine: ${oldest}`);
        destroyEngine(oldest);
    }
}

function destroyEngine(infoHash) {
    const entry = activeEngines[infoHash];
    if (!entry) return;

    clearTimeout(entry.timeout);
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

        return entry.engine;
    }

    // Evict if at capacity
    evictIfNeeded();

    const magnet = buildMagnet(infoHash);
    console.log(`[Engine] Creating new engine: ${infoHash.substring(0, 8)}…`);

    const engine = torrentStream(magnet, {
        tmp: '/tmp/torrent-stream',
        connections: 50,
        uploads: 0, // Don't upload (save bandwidth)
        verify: true,
        dht: true,
    });

    const entry = {
        engine,
        lastAccess: Date.now(),
        timeout: setTimeout(() => destroyEngine(infoHash), ENGINE_TIMEOUT),
    };

    activeEngines[infoHash] = entry;
    return engine;
}

// ─── Video file detection ────────────────────────────────
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

function isVideoFile(filename) {
    const lower = filename.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function findVideoFile(files, fileIdx) {
    // If fileIdx is specified, use that directly
    if (fileIdx !== undefined && fileIdx !== null && files[fileIdx]) {
        return files[fileIdx];
    }

    // Otherwise find the largest video file
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

// ─── Stream Proxy Route ─────────────────────────────────
app.get('/stream/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const fileIdx = req.query.fileIdx !== undefined ? parseInt(req.query.fileIdx, 10) : undefined;

    console.log(`[Stream] Request for ${infoHash.substring(0, 8)}… fileIdx=${fileIdx}`);

    const engine = getOrCreateEngine(infoHash);
    let responded = false;

    // Handle client disconnect
    req.on('close', () => {
        console.log(`[Stream] Client disconnected: ${infoHash.substring(0, 8)}…`);
    });

    engine.on('ready', () => {
        if (responded) return;
        responded = true;

        const file = findVideoFile(engine.files, fileIdx);

        if (!file) {
            console.error(`[Stream] No video file found in torrent ${infoHash.substring(0, 8)}…`);
            res.status(404).json({ error: 'No video file found in this torrent' });
            return;
        }

        console.log(`[Stream] Serving: "${file.name}" (${(file.length / 1024 / 1024).toFixed(1)} MB)`);

        const totalSize = file.length;

        // Determine Content-Type from extension
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

        // Handle Range requests (seeking support)
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
            });

            const stream = file.createReadStream({ start, end });
            stream.pipe(res);

            stream.on('error', (err) => {
                console.error(`[Stream] Read error: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).end();
                }
            });
        } else {
            // Full file request
            console.log(`[Stream] Full file request: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

            res.writeHead(200, {
                'Content-Length': totalSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
            });

            const stream = file.createReadStream();
            stream.pipe(res);

            stream.on('error', (err) => {
                console.error(`[Stream] Read error: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).end();
                }
            });
        }
    });

    // Handle engine errors
    engine.on('error', (err) => {
        console.error(`[Engine Error] ${err.message}`);
        if (!responded) {
            responded = true;
            res.status(500).json({ error: 'Failed to initialize torrent' });
        }
    });

    // Timeout: if torrent doesn't connect in 30s, give up
    setTimeout(() => {
        if (!responded) {
            responded = true;
            console.error(`[Stream] Timeout waiting for torrent: ${infoHash.substring(0, 8)}…`);
            res.status(504).json({ error: 'Torrent connection timed out' });
        }
    }, 30000);
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
// v1.3.0 deploy trigger
