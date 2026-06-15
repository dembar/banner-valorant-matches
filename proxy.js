// ============================================================
//  VALORANT MASTERS LONDON - SCOREBOARD PROXY v5
//  Uso: node proxy.js
// ============================================================

const http     = require('http');
const https    = require('https');
const readline = require('readline');

const PORT             = 3030;
const POLL_INTERVAL_MS = 15000;

function askURL() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  VALORANT SCOREBOARD PROXY v5 - DEMBAR   ║');
    console.log(`║  http://localhost:${PORT}/score              ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('Pega la URL del partido con el PRIMER MAPA seleccionado.');
    console.log('Ejemplo: https://www.vlr.gg/670468/equipo-a-vs-equipo-b/?game=267810&tab=overview');
    console.log('');
    rl.question('URL > ', (input) => { rl.close(); resolve(input.trim()); });
  });
}

function parseInputURL(input) {
  try {
    const url = new URL(input);
    return { matchURL: url.origin + url.pathname, firstGameId: url.searchParams.get('game') };
  } catch (e) {
    return { matchURL: input.split('?')[0], firstGameId: null };
  }
}

let MATCH_URL     = '';
let FIRST_GAME_ID = null;

let cachedScore = {
  teamA: { name: 'TBD', short: 'TBD', score: 0, logo: '', mapsWon: 0 },
  teamB: { name: 'TBD', short: 'TBD', score: 0, logo: '', mapsWon: 0 },
  map: 'LIVE', mapNumber: 1, seriesFormat: 'bo3', totalMaps: 3,
  gameIds: [], lastUpdated: null, status: 'waiting'
};

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchHTML(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function shortName(name) {
  return String(name || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '???';
}

function extractBetween(str, start, end, fromIndex = 0) {
  const s = str.indexOf(start, fromIndex);
  if (s === -1) return null;
  const e = str.indexOf(end, s + start.length);
  if (e === -1) return null;
  return { value: str.slice(s + start.length, e), end: e + end.length };
}

function mapIsFinished(a, b) {
  a = Number(a) || 0; b = Number(b) || 0;
  if (a >= 13 || b >= 13) return true;
  if (a >= 12 && b >= 12 && Math.abs(a - b) >= 2) return true;
  return false;
}

function parseVLR(html) {

  // 1. SERIES FORMAT
  let seriesFormat = 'bo3', totalMaps = 3;
  const formatMatch = html.match(/class="match-header-vs-note"[^>]*>\s*(Bo\d)/i);
  if (formatMatch) {
    const raw = formatMatch[1].toLowerCase();
    seriesFormat = raw;
    totalMaps = raw === 'bo5' ? 5 : 3;
    console.log(`[proxy] Serie detectada: ${raw.toUpperCase()} (${totalMaps} mapas max)`);
  }

  // 2. GAME IDS
  const gameIdRe = /class="vm-stats-game\s*"\s+data-game-id="(\d+)"/g;
  const gameIds = [];
  let gm;
  while ((gm = gameIdRe.exec(html)) !== null) {
    if (!gameIds.includes(gm[1])) gameIds.push(gm[1]);
  }
  const activeIdMatch = html.match(/class="vm-stats-game mod-active"\s+data-game-id="(\d+)"/);
  const activeGameIdFromHeader = activeIdMatch ? activeIdMatch[1] : null;
  if (activeGameIdFromHeader && !gameIds.includes(activeGameIdFromHeader)) {
    gameIds.push(activeGameIdFromHeader);
  }
  gameIds.sort((a, b) => parseInt(a) - parseInt(b));
  if (FIRST_GAME_ID && gameIds[0] !== FIRST_GAME_ID) {
    console.log(`[proxy] ⚠️  ID más bajo (${gameIds[0]}) no coincide con primer mapa (${FIRST_GAME_ID})`);
  }
  console.log(`[proxy] Game IDs detectados: [${gameIds.join(', ')}] | Ancla: ${FIRST_GAME_ID || 'no detectado'}`);

  // 3. NOMBRES Y LOGOS
  let nameA = 'TBD', nameB = 'TBD', logoA = '', logoB = '';
  const nameRe = /class="wf-title-med(?:\s+[^\"]*)?"\s*>\s*([^<]{2,60}?)\s*<\/div>/g;
  const names = [];
  let nm;
  while ((nm = nameRe.exec(html)) !== null && names.length < 2) {
    const n = nm[1].trim();
    if (n) names.push(n);
  }
  if (names[0]) nameA = names[0];
  if (names[1]) nameB = names[1];

  const logoRe = /alt="[^"]*team logo"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*alt="[^"]*team logo"/g;
  const logos = [];
  let lm;
  while ((lm = logoRe.exec(html)) !== null && logos.length < 2) {
    const src = (lm[1] || lm[2] || '').replace(/^\/\//, 'https://');
    if (src) logos.push(src);
  }
  if (logos[0]) logoA = logos[0];
  if (logos[1]) logoB = logos[1];

  // 4. MAPAS GANADOS
  let mapsWonA = 0, mapsWonB = 0;
  const spoilerRe = /class="js-spoiler\s*">\s*<span class[^>]*>\s*(\d+)\s*<\/span>[\s\S]*?<span class[^>]*>\s*(\d+)\s*<\/span>/;
  const spoilerMatch = html.match(spoilerRe);
  if (spoilerMatch) {
    mapsWonA = parseInt(spoilerMatch[1]) || 0;
    mapsWonB = parseInt(spoilerMatch[2]) || 0;
  }
  if (mapsWonA === 0 && mapsWonB === 0) {
    const vsBlock = extractBetween(html, 'class="match-header-vs-score"', 'match-header-note');
    if (vsBlock) {
      const allNums = [...vsBlock.value.matchAll(/>(\d+)</g)].map(m => parseInt(m[1]));
      if (allNums.length >= 2) { mapsWonA = allNums[0]; mapsWonB = allNums[1]; }
    }
  }

  // 5. MAPA ACTIVO Y SCORE DE RONDAS
let currentMap = 'LIVE', roundScoreA = 0, roundScoreB = 0, currentMapNum = 1;
const activeIdx = html.indexOf('vm-stats-game mod-active');
if (activeIdx !== -1) {
  // Acotar el bloque al siguiente vm-stats-game para no mezclar datos de otros mapas
  const nextGameIdx = html.indexOf('vm-stats-game', activeIdx + 100);
  const blockEnd = nextGameIdx !== -1 ? nextGameIdx : activeIdx + 4000;
  const gameBlock = html.slice(activeIdx, blockEnd);

  // Buscar SOLO scores con style inline (los del header del mapa activo)
  const scoreRe = /class="score\s*"\s+style="[^"]*">\s*(\d+)\s*<\/div>/g;
  const roundScores = [];
  let rs;
  while ((rs = scoreRe.exec(gameBlock)) !== null && roundScores.length < 2) {
    roundScores.push(parseInt(rs[1]));
  }

  // Fallback: si no encontró con style, buscar class="score" pero
  // SOLO dentro del primer div.score-container del bloque activo
  if (roundScores.length < 2) {
    const scoreContainerStart = gameBlock.indexOf('score-container');
    const scoreContainerEnd   = scoreContainerStart !== -1
      ? gameBlock.indexOf('</div>', scoreContainerStart + 200)
      : -1;
    const scoreZone = scoreContainerStart !== -1
      ? gameBlock.slice(scoreContainerStart, scoreContainerEnd + 6)
      : gameBlock.slice(0, 800); // solo primeros 800 chars como último recurso

    const re2 = /class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/g;
    let r2;
    while ((r2 = re2.exec(scoreZone)) !== null && roundScores.length < 2) {
      roundScores.push(parseInt(r2[1]));
    }
  }

  if (roundScores[0] != null) roundScoreA = roundScores[0];
  if (roundScores[1] != null) roundScoreB = roundScores[1];

    const mapBlock = extractBetween(gameBlock, 'class="map"', '</div>');
    if (mapBlock) {
      const raw = cleanText(mapBlock.value)
        .replace(/\s*(PICK|BAN|REMAINING|DECIDER)\s*/gi, '')
        .replace(/^\s*[>◆♦\-]\s*/, '').trim();
      if (raw && raw.length > 1) currentMap = raw;
    }

    const activeGameId = activeGameIdFromHeader || (gameBlock.match(/data-game-id="(\d+)"/) || [])[1];
    if (activeGameId && gameIds.length) {
      const pos = gameIds.indexOf(activeGameId);
      currentMapNum = pos !== -1 ? pos + 1 : mapsWonA + mapsWonB + 1;
    } else {
      currentMapNum = mapsWonA + mapsWonB + 1;
    }
  }

  return {
    teamA: { name: nameA, short: shortName(nameA), score: roundScoreA, logo: logoA, mapsWon: mapsWonA },
    teamB: { name: nameB, short: shortName(nameB), score: roundScoreB, logo: logoB, mapsWon: mapsWonB },
    map: currentMap, mapNumber: currentMapNum, seriesFormat, totalMaps, gameIds,
    lastUpdated: new Date().toISOString(), status: 'ok'
  };
}

module.exports = { parseVLR };

async function pollScore() {
  try {
    console.log(`[proxy] Scraping VLR.gg...`);
    const html = await fetchHTML(MATCH_URL);
    const fs = require('fs');
    fs.writeFileSync('vlr-debug.html', html, 'utf8');
    const parsed = parseVLR(html);
    cachedScore = parsed;
    console.log(
      `[proxy] ✅ [${parsed.seriesFormat.toUpperCase()}] Mapa ${parsed.mapNumber}/${parsed.totalMaps} | ` +
      `${parsed.teamA.short}(${parsed.teamA.mapsWon}) ${parsed.teamA.score} : ` +
      `${parsed.teamB.score} ${parsed.teamB.short}(${parsed.teamB.mapsWon}) | ${parsed.map}`
    );
  } catch (err) {
    cachedScore.status = 'error';
    console.log(`[proxy] ❌ Error: ${err.message}`);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/score') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(cachedScore));
    return;
  }

  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ alive: true, lastUpdated: cachedScore.lastUpdated }));
    return;
  }

  if (req.url.startsWith('/img?url=')) {
    const imgUrl = decodeURIComponent(req.url.slice(9));
    if (!imgUrl.startsWith('https://owcdn.net/')) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Dominio no permitido' }));
      return;
    }
    https.get(imgUrl, {
      headers: {
        'Referer': 'https://www.vlr.gg/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      }
    }, (imgRes) => {
      res.writeHead(200, {
        'Content-Type': imgRes.headers['content-type'] || 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      });
      imgRes.pipe(res);
    }).on('error', (e) => {
      console.log(`[proxy] ❌ Error imagen: ${e.message}`);
      res.writeHead(502); res.end();
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Use /score' }));
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', async () => {
    const input = await askURL();
    const { matchURL, firstGameId } = parseInputURL(input);
    MATCH_URL     = matchURL;
    FIRST_GAME_ID = firstGameId;
    console.log('');
    console.log(`[proxy] Partido : ${MATCH_URL}`);
    console.log(`[proxy] Mapa 1  : game=${FIRST_GAME_ID || 'no detectado en URL'}`);
    console.log('');
    pollScore();
    setInterval(pollScore, POLL_INTERVAL_MS);
    console.log(`[proxy] Actualizando cada ${POLL_INTERVAL_MS / 1000}s. Ctrl+C para detener.\n`);
  });
}
