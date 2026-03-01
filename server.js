const express = require('express');
const cors = require('cors');
const { getRouter } = require('stremio-addon-sdk');
const torrentStream = require('torrent-stream');
const { addonInterface, setHost } = require('./addon');

const app = express();
app.use(cors());

app.use((req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host) {
        setHost(`${protocol}://${host}`);
    }
    next();
});

// Mount the Stremio Addon routes (/manifest.json, /stream/...)
app.use(getRouter(addonInterface));

const activeEngines = new Map();

app.get('/stream/:infoHash', (req, res) => {
    const infoHash = req.params.infoHash;
    const magnetURI = `magnet:?xt=urn:btih:${infoHash}`;

    console.log(`[stream] HTTP Request for infoHash: ${infoHash}`);

    let engine = activeEngines.get(infoHash);

    if (!engine) {
        console.log(`[stream] Creating new engine for ${infoHash}`);
        engine = torrentStream(magnetURI, {
            path: '/tmp/torrent-stream-' + infoHash
        });

        engine.on('ready', () => {
            console.log(`[stream] Engine ready for ${infoHash}`);
            let targetFile = engine.files[0];

            for (let i = 1; i < engine.files.length; i++) {
                if (engine.files[i].length > targetFile.length) {
                    targetFile = engine.files[i];
                }
            }

            console.log(`[stream] Selected file: ${targetFile.name} (${targetFile.length} bytes)`);
            engine.targetFile = targetFile;
            engine.isReadyForStream = true;
        });

        activeEngines.set(infoHash, engine);

        // Simple memory cleanup: remove engine after 2 hours
        setTimeout(() => {
            if (activeEngines.has(infoHash)) {
                console.log(`[stream] Destroying engine for ${infoHash} after 2 hours.`);
                const eng = activeEngines.get(infoHash);
                eng.destroy();
                activeEngines.delete(infoHash);
            }
        }, 2 * 60 * 60 * 1000);
    }

    const waitForEngine = () => {
        if (engine.isReadyForStream && engine.targetFile) {
            serveFile(req, res, engine.targetFile);
        } else {
            console.log(`[stream] Waiting for engine ready...`);
            setTimeout(() => {
                if (activeEngines.has(infoHash)) {
                    waitForEngine();
                } else {
                    res.status(500).send('Engine destroyed before ready');
                }
            }, 500);
        }
    };

    waitForEngine();
});

const serveFile = (req, res, file) => {
    const range = req.headers.range;

    if (!range) {
        res.writeHead(200, {
            'Content-Length': file.length,
            'Content-Type': 'video/mp4'
        });
        file.createReadStream().pipe(res);
        return;
    }

    const positions = range.replace(/bytes=/, "").split("-");
    const start = parseInt(positions[0], 10);
    const end = positions[1] ? parseInt(positions[1], 10) : file.length - 1;
    const chunksize = (end - start) + 1;

    console.log(`[stream] Serving range ${start}-${end} (${chunksize} bytes) of ${file.name}`);

    res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
    });

    const stream = file.createReadStream({ start, end });
    stream.pipe(res);

    stream.on('error', (err) => {
        console.error(`[stream] Error in read stream:`, err.message);
    });
};

app.get('/', (req, res) => {
    res.send('Render Torrent Stream for Stremio is running. Add this url to Stremio: ' + currentHost + '/manifest.json');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Addon listening on port ${PORT}`);
    console.log(`Stremio URL: http://localhost:${PORT}/manifest.json`);
});
