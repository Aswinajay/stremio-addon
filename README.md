# 🎬 Render Torrent Stream (Hydra+) — v3.5.20

Stream movies & TV series from **40+ aggregated torrent sources** with **Dynamic Resource Management**. This addon is specifically engineered for high-performance streaming on free-tier cloud platforms like Render.com (512MB RAM).

## 🚀 What makes Hydra+ (v3.5.x) different?

Hydra+ is a complete overhaul of the original engine, focusing on **Survival & Stability**. It uses a real-time "Smart Throttle" to prevent the server from crashing or restarting, even when multiple users are streaming simultaneously.

### 🧠 Intelligent Resource Controller
- **Dynamic Scaling**: The server real-time monitors its own RAM usage every 30 seconds and automatically shifts between 7 performance modes:
  - ⚡ **HIGH Mode** (< 100MB RAM): **60 peer connections** for maximum speed.
  - ⚖️ **BALANCED/MEDIUM Modes**: Throttles connections to keep memory stable.
  - 🚨 **CRITICAL/EMERGENCY Modes** (> 185MB RAM): Dials connections down as low as **1 peer** to prevent an OOM (Out Of Memory) restart.
- **Unlimited Engine Capacity**: We removed the artificial "Max 3 Movies" limit. As long as your RAM is under the 200MB safety line, you can have an unlimited number of concurrent streams.

### 📡 Smart Scraping "Waves"
- **Anti-Spike Logic**: Scrapers no longer fire all at once (which causes RAM spikes). They now fire in **3 timed waves** with a 100ms cooling period in between to let the Node.js Garbage Collector breathe.
- **5MB Payload Cap**: Every incoming scraper response is capped at 5MB to prevent massive HTML pages from flooding the server's memory.

### 🥇 Superior Stream Quality
- **Smart Torrent Merging**: If multiple sources (YTS, TPB, Torrentio) find the same file, Hydra+ **fuses them into one**. It combines the source labels (e.g., `Source: YTS + TPB + Comet`) and automatically uses the **highest reported seeder count** among them.
- **No Filters, No Limits**: We removed all CAM/0-seed filters and result caps. You get every single result the scrapers find, sorted by quality.
- **45s Pure Cleanup**: If you close a movie, the engine is forcefully terminated after 45 seconds of abandonment, instantly freeing up RAM for the next user.

---

## 🎨 How It Works

```
Stremio Player  ←──  HTTP Stream (Range Support)  ←──  Hydra+ Engine (RAM Guard)  ←──  40+ Aggregated Scrapers
```

## 🛠️ Deploy to Render.com (Free Tier)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "feat: v3.5.20 Hydra+ Hyper-Stability"
git remote add origin https://github.com/YOUR_USERNAME/stremio-addon.git
git push -u origin main
```

### 2. Deploy on Render
1. Go to [render.com](https://render.com/) and sign up.
2. Click **New** → **Web Service** → Connect your GitHub repo.
3. Settings (Auto-detected):
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. Add Environment Variable (Optional but recommended):
   - `PORT`: `10000`

### 3. Install in Stremio
1. Copy your Render URL (e.g., `https://stremio-addon-xxxx.onrender.com`).
2. Open **Stremio** → **Addons** → Paste the URL in the search bar.
3. Ensure it ends in `/manifest.json`.

---

## 📊 Live Monitoring
Visit `/dashboard` on your addon URL to see the **Real-time Engine Monitor**:
- **Dynamic Mode Badge**: See if the server is in HIGH, BALANCED, or CRITICAL mode.
- **Peers & Speeds**: Watch the active swarm for every movie currently being watched.
- **RAM Usage**: Monitor the 200MB safety line in real-time.

## ⚙️ Survival Configurations (Hardcoded for Render)

| Component | Hydra+ v3.5.20 Logic |
|-----------|----------------------|
| **RAM Limit** | 200 MB (Hard Guardrail) |
| **Engine Cap** | Unlimited (RAM-Dependent) |
| **Abandonment** | 45 Seconds (Instant Kill) |
| **Conns Range** | 1 to 60 (Dynamic Scaling) |
| **GC Pause** | 100ms (Between Scrapers) |

## License
MIT
