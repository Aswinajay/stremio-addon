# Render Torrent Stream - Stremio Addon

A Stremio Addon that streams torrents (movies) by proxying them through an external server. This is especially useful for avoiding buffer and connection limits associated with local P2P capabilities on some networks or devices. 

It uses the [Render.com Free Plan](https://render.com/) to host a lightweight Node.js express application that leverages `torrent-stream` to fetch the stream from the swarm and serve it over basic HTTP.

## Deploying to Render.com (Free Plan)

The easiest way to host this yourself for free:

1. **Fork or push this repository** to your own GitHub account.
2. Sign up or log in to **[Render.com](https://render.com/)**.
3. Create a **New Web Service**.
4. Connect your GitHub account and select this repository.
5. In the Web Service settings:
   - **Name**: `stremio-torrent-proxy` (or any name you like)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Select the **Free** tier.
6. Click **Create Web Service**.
7. Render will begin building. Once completed, your app will be live at a URL looking like `https://stremio-torrent-proxy.onrender.com`.

> **Note**: Render's free tier spins down the application after 15 minutes of inactivity. This means your first movie request in a while might take up to ~50 seconds to start playing as the server wakes up.

## Installing to Stremio

Once you have your Render URL (e.g., `https://your-app.onrender.com`):

1. **Open Stremio**.
2. Go to the Addons section.
3. Paste the URL `https://your-app.onrender.com/manifest.json` into the Stremio Addon search bar.
4. Click **Install**.

Now, when you click on a Movie in Stremio and view its streams, you will see options like "Render Stream - 1080p (2.1 GB)". Clicking on this stream will play the torrent instantly via your Render cloud server instead of standard P2P.

## How it works

1. The addon intercepts requests for movies (`tt1234567`).
2. It hits the **YTS API** to retrieve available torrent magnet links.
3. It passes these hashes back to Stremio.
4. When Stremio requests the HTTP proxy url (e.g. `/stream/HASH`), the Node.js express server initializes `torrent-stream`.
5. It finds the largest file in the payload and pipes it progressively via HTTP 206 Partial Content responses directly to Stremio.
