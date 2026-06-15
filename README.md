# 🎯 Valorant Live Scoreboard — OBS Overlay

A real-time scoreboard overlay for OBS Studio that scrapes live match data from [vlr.gg](https://www.vlr.gg) and displays it as a transparent browser source. Built for Valorant esports broadcasts and streams.

![Overlay Preview](https://i.imgur.com/placeholder.png)

---

## 📦 Files

| File | Description |
|------|-------------|
| `proxy.js` | Node.js local server — scrapes VLR.gg and exposes a `/score` JSON endpoint |
| `scoreboard.html` | OBS browser source overlay — polls the proxy and renders the live scoreboard |

---

## ✅ Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- OBS Studio with **Browser Source** support
- An active match page on [vlr.gg](https://www.vlr.gg)

No npm packages required — uses Node.js built-in modules only (`http`, `https`, `readline`).

---

## 🚀 Quick Start

### 1. Start the proxy

```bash
node proxy.js
```

The proxy will prompt you to paste the VLR.gg match URL **with the first map selected**:

```
╔══════════════════════════════════════════╗
║  VALORANT SCOREBOARD PROXY v5 - DEMBAR   ║
║  http://localhost:3030/score             ║
╚══════════════════════════════════════════╝

Pega la URL del partido con el PRIMER MAPA seleccionado.
Ejemplo: https://www.vlr.gg/670468/equipo-a-vs-equipo-b/?game=267810&tab=overview

URL >
```

> **Important:** The URL must include the `?game=XXXXXX` parameter pointing to **Map 1**. Navigate to the match page on VLR.gg, click the first map tab, and copy the full URL from your browser.

Once running, the proxy scrapes VLR.gg every **15 seconds** and serves live data at:

```
http://localhost:3030/score
```

### 2. Add to OBS

1. In OBS, add a new **Browser Source**
2. Check **Local file** and select `scoreboard.html` — OR set the URL to the full path:
   ```
   file:///C:/path/to/scoreboard.html
   ```
3. Set width to `600` and height to `80`
4. Enable **Shutdown source when not visible** (optional but recommended)

The overlay will connect automatically and update every 10 seconds.

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /score` | Full match JSON — scores, maps, team names, logos |
| `GET /health` | Proxy status and last update timestamp |
| `GET /img?url=<owcdn_url>` | Image proxy — serves team logos bypassing CORS |

### Example `/score` response

```json
{
  "teamA": { "name": "Xi Lai Gaming", "short": "XIL", "score": 7, "logo": "https://owcdn.net/img/...", "mapsWon": 1 },
  "teamB": { "name": "EDward Gaming", "short": "EDW", "score": 5, "logo": "https://owcdn.net/img/...", "mapsWon": 0 },
  "map": "Split",
  "mapNumber": 2,
  "seriesFormat": "bo3",
  "totalMaps": 3,
  "gameIds": ["267810", "267811", "267812"],
  "lastUpdated": "2026-06-15T16:21:47.203Z",
  "status": "ok"
}
```

---

## 🖥️ Overlay Features

- **Live round score** — updates every 10 seconds
- **Map series diamonds** — filled diamonds show maps won per team (BO3 or BO5)
- **Current map name** — auto-detected from VLR.gg
- **MAP X/Y label** — shows current map number in the series
- **Team logos** — loaded via local image proxy (no CORS issues)
- **Connection indicator** — green pulse when connected, red dot + dimmed overlay when proxy is offline
- **Transparent background** — designed for OBS chroma or direct overlay use

### Console controls

```javascript
window.__scoreboard.stopPolling()   // Pause auto-refresh
window.__scoreboard.startPolling()  // Resume auto-refresh
window.__scoreboard.refresh()       // Force immediate update
```

---

## 🔧 Configuration

At the top of `proxy.js`:

```javascript
const PORT             = 3030;        // Local server port
const POLL_INTERVAL_MS = 15000;       // Scrape interval in milliseconds
```

At the top of `scoreboard.html` script section:

```javascript
const API_URL       = 'http://localhost:3030/score';
const POLL_INTERVAL = 10000;   // Banner refresh interval in milliseconds
```

---

## 🏗️ Architecture

```
VLR.gg ──scrape──▶ proxy.js (localhost:3030) ──fetch──▶ scoreboard.html ──render──▶ OBS
                        │
                        └── /img proxy (team logos, CORS bypass)
```

The proxy and overlay are intentionally separated: the proxy handles all external network requests and data parsing, while the overlay is a pure static HTML file with no external dependencies at runtime.

---

## ⚠️ Known Limitations

- VLR.gg may have a **5–30 second delay** before updating the active map after a map ends. The proxy will display the finished map's final score until VLR.gg refreshes its HTML.
- Team logo images are served through a local proxy (`/img`) because `owcdn.net` blocks direct requests from `file://` origins (OBS browser sources).
- This tool scrapes a public website — use responsibly and avoid excessive polling intervals.

---

## 📄 License

MIT — free to use, modify, and distribute. Not affiliated with Riot Games or VLR.gg.

---

## 🌈 Branches

- `main`: Default overlay with the dark/black theme (Black Team).
- `whiteTema`: Alternative branch providing a light/white theme for users who prefer a white team/banner.

To try the white theme locally, switch to the branch and reload your OBS browser source:

```bash
git fetch origin
git checkout whiteTema
```
