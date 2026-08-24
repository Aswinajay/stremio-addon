# 🎬 Torrent to weblink — The Ultimate Stremio Addon

[![Status](https://img.shields.io/badge/Status-Healthy-brightgreen?style=for-the-badge)](https://stremio.eletroclay.com/health)
[![Version](https://img.shields.io/badge/Version-4.0.0-blue?style=for-the-badge)](https://github.com/Aswinajay/stremio-addon)
[![Host](https://img.shields.io/badge/Host-Google%20Cloud%20Run-4285F4?style=for-the-badge&logo=google-cloud)](https://cloud.run)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.style=for-the-badge)](https://opensource.org/licenses/MIT)

**Torrent to weblink** is a high-performance, self-hosted **Stremio addon** engineered for flawless streaming on autoscaling cloud platforms like **Google Cloud Run** (scale-to-zero, pay only while streaming).

By utilizing an intelligent engine manager, this addon streams **4K HDR Movies and TV Series** from **40+ aggregated torrent sources** without buffering or OOM restarts.

---

## 🔥 Unmatched Streaming Features

- **🌐 40+ Aggregated Scrapers**: Fetches results in real-time from top-tier sources including **The Pirate Bay (TPB), YTS, Torrentio, Comet, MediaFusion, Nyaa, and Jackettio**.
- **🌊 Smart Scraper Waves**: Scrapers execute in 3 timed waves with automated Garbage Collection (GC) pauses. This prevents server memory spikes normally caused by bulk API requests.
- **🧬 Advanced Torrent Merging**: If multiple scrapers find the exact same file (matching hash), the addon **fuses them into a single result**, combining source tags and prioritizing the highest seeder count.
- **♾️ No Arbitrary Limits**: Watch as many concurrent movies as you want. There are no artificial "Max 3 Streams" limits — capacity is 100% dynamic.
- **🧹 15-Minute Auto-Cleanup**: Idle torrent engines are terminated after 15 minutes of inactivity, flushing resources automatically.

---

## 🛠️ How To Deploy Your Own

### Method 1: Google Cloud Run (Recommended — scales to zero)
Cheapest option: pay **$0 when idle**, auto-scales with demand, and stays within Cloud Run's free tier for personal use.

1. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and authenticate:
   ```bash
   gcloud auth login
   gcloud projects create stremio-aswin   # or use an existing project
   gcloud billing projects link stremio-aswin --billing-account=<YOUR_BILLING_ID>
   gcloud config set project stremio-aswin
   ```
2. Clone and deploy (one command handles build + cheapest autoscaling config):
   ```bash
   git clone https://github.com/Aswinajay/stremio-addon.git
   cd stremio-addon
   ./deploy.sh
   ```
3. Your addon is live at the printed URL. To use a custom domain:
   ```bash
   gcloud beta run domain-mappings create --service stremio-addon \
     --domain stremio.yourdomain.com --region us-central1
   # then add a CNAME record: stremio -> ghs.googlehosted.com
   ```

The included `deploy.sh` configures: scale-to-zero (`min-instances=0`), cost-capped autoscaling (`max-instances=3`), 1 vCPU / 512Mi, request-based billing, and a 1-hour timeout for long streams.

### Method 2: Local / VPS Hosting
```bash
git clone https://github.com/Aswinajay/stremio-addon.git
cd stremio-addon
npm install
npm start
# Server will run on http://localhost:3000
```

### Method 3: Any Docker Host
```bash
docker build -t stremio-addon .
docker run -p 3000:8080 -e PUBLIC_URL=https://your-domain.com stremio-addon
```

---

## 🔌 Quick Install (Use the Live Server)

Don't want to deploy your own? Use the public instance of **Torrent to weblink** right now:

1. Open Stremio.
2. Go to **Addons** → **Add External Addon**.
3. Paste: `https://stremio.eletroclay.com/manifest.json`
4. Click **Install**.

---

## 🔌 How to Install Your Own Deploy

1. Copy your deployed server URL (e.g., `https://stremio.eletroclay.com`).
2. Open the **Stremio App**.
3. Go to the **Addons** section.
4. Click on the search bar / **Add external addon**.
5. Paste your URL, ensure it ends with `/manifest.json` (e.g., `https://stremio.eletroclay.com/manifest.json`).
6. Click **Install**. You are ready to stream!

---

## 📊 Real-Time Server Monitoring

Built-in endpoints so you can monitor your server's health:
- **Graphical Dashboard**: Navigate to `/dashboard` on your deployed URL to see live Active Engines, Download Speeds, Peers, and RAM usage.
- **Health JSON API**: Navigate to `/health` for raw server metrics and uptime.

---

## ☕ Support the Development

Building and maintaining high-performance streaming addons takes time and coffee. If this addon improved your streaming experience and saved you money on Debrid services, please consider supporting the developer!

<a href="https://www.buymeacoffee.com/withaswin" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;">
</a>

---

## 📜 License
This project is open-source software licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.
