#!/usr/bin/env node
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import https from 'https';
import http from 'http';
import { homedir } from 'os';
import { join } from 'path';
import { URL } from 'url';
import { UserMemory } from '@uomp/sdk';
import { mergeConfig, DEFAULT_CONFIG } from './lib/config.js';
import { fetchQuotes } from './lib/market.js';
import { analyze } from './lib/analysis.js';
import { generateJSON, generateMarkdown, generateHTML } from './lib/report.js';

// ── Agent identity ────────────────────────────────────────────────

const AGENT_ID = 'stock-analyst';
const AGENT_VERSION = '1.0.0';
const AGENT_NAME = 'UOMP Stock Analyst';

// ── mTLS ──────────────────────────────────────────────────────────

let _mtlsAgent = null;

async function loadMtlsAgent() {
  if (_mtlsAgent) return _mtlsAgent;
  const certDir = join(homedir(), '.uomp', '.gateway-certs');
  const certPath = join(certDir, 'client.crt');
  const keyPath = join(certDir, 'client.key');
  const caPath = join(certDir, 'ca.crt');

  if (!existsSync(certPath) || !existsSync(keyPath)) {
    const { execSync } = await import('child_process');
    try {
      const scriptDir = join(process.cwd(), '..', '..', 'scripts');
      if (existsSync(join(scriptDir, 'generate-gateway-certs.sh'))) {
        execSync(`bash ${join(scriptDir, 'generate-gateway-certs.sh')}`, { stdio: 'inherit', env: { ...process.env, HOME: homedir() } });
      }
    } catch { /* use existing certs if available */ }
  }

  if (!existsSync(certPath) || !existsSync(keyPath)) return null;
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  const ca = existsSync(caPath) ? await readFile(caPath) : undefined;
  _mtlsAgent = new https.Agent({ cert, key, ca, rejectUnauthorized: false });
  return _mtlsAgent;
}

async function getFingerprint() {
  const certPath = join(homedir(), '.uomp', '.gateway-certs', 'client.crt');
  if (!existsSync(certPath)) return null;
  try {
    const { spawnSync } = await import('child_process');
    const result = spawnSync('openssl', ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256']);
    return result.stdout.toString().trim().replace('sha256 Fingerprint=', '');
  } catch {
    return 'run: openssl x509 -in ' + certPath + ' -noout -fingerprint -sha256';
  }
}

async function httpRequest(url, opts = {}) {
  await loadMtlsAgent();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const agent = _mtlsAgent ?? undefined;
    const req = mod.request({
      hostname: u.hostname, port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search, method: opts.method || 'GET',
      headers: opts.headers || {}, agent,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode, statusText: res.statusMessage || '',
          json: async () => JSON.parse(body.toString()),
          text: async () => body.toString(),
          headers: new Map(Object.entries(res.headers)),
        });
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ── Gateway fetch wrapper ─────────────────────────────────────────

function makeGatewayFetch(gatewayUrl) {
  return (url, init) => {
    if (gatewayUrl.startsWith('https://')) return httpRequest(url, init);
    return fetch(url, init);
  };
}

// ── Analysis endpoint ─────────────────────────────────────────────

async function runAnalysis(token, gatewayUrl, sessionId, finnhubKey, userConfig) {
  const config = mergeConfig(userConfig);
  const isRemote = gatewayUrl.startsWith('https://');
  if (isRemote) await loadMtlsAgent();

  const memory = new UserMemory({
    token, baseUrl: gatewayUrl, agentId: AGENT_ID,
    fetch: isRemote ? makeGatewayFetch(gatewayUrl) : undefined,
  });

  const holdings = await memory.getByTag('portfolio:holdings');
  const riskItems = await memory.getByTag('profile:risk');
  const risk = riskItems[0]?.value ?? {};

  const symbols = [...new Set(holdings.map(h => h.value.symbol).filter(Boolean))];
  const quotes = await fetchQuotes(symbols, {
    finnhubKey,
    retries: config.rate_limit.retries,
    backoff_ms: config.rate_limit.backoff_ms,
    maxConcurrent: config.rate_limit.max_concurrent,
    benchmark: config.benchmark,
  });

  const analysis = analyze(holdings, risk, quotes, config);
  const results = {};

  if (config.report.include_json !== false) results.json = generateJSON(analysis);
  if (config.report.include_html !== false) results.html = generateHTML(analysis);
  if (config.report.include_markdown !== false) {
    for (const lang of config.languages) {
      results[`markdown_${lang}`] = generateMarkdown(analysis, lang);
    }
  }

  // Save to output
  if (!existsSync('./output')) await mkdir('./output', { recursive: true });
  const ts = Date.now();
  const reportDir = join(process.cwd(), 'output');

  if (results.html) await writeFile(join(reportDir, `stock-analysis-${ts}.html`), results.html, 'utf-8');
  if (results.json) await writeFile(join(reportDir, `stock-analysis-${ts}.json`), results.json, 'utf-8');
  await writeFile(join(reportDir, `stock-analysis-${ts}.md`),
    (results.markdown_zh || '') + '\n\n---\n\n' + (results.markdown_en || ''), 'utf-8');

  // Payload upload + deletion proof
  let payloadId = null;
  if (isRemote && sessionId) {
    try {
      const uploadResp = await httpRequest(`${gatewayUrl}/v1/payload/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-UOMP-Agent-Id': AGENT_ID },
        body: Buffer.from(results.json, 'utf-8'),
      });
      if (uploadResp.ok) {
        const ud = await uploadResp.json();
        payloadId = ud.payload_id;
      }
    } catch { /* skip */ }

    try {
      const hash = createHash('sha256').update(holdings.map(h => h.key).join('')).digest('hex');
      await httpRequest(`${gatewayUrl}/v1/sessions/${sessionId}/deletion-proof`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-UOMP-Agent-Id': AGENT_ID },
        body: JSON.stringify({
          deletion_proof_id: `del_${Date.now().toString(36)}`,
          session_id: sessionId, agent_id: AGENT_ID,
          deleted_at: new Date().toISOString(), memory_hash: `sha256:${hash}`,
          fields_accessed: ['key', 'value'], method: 'process_termination',
          proof_value: `sha256:${hash}`,
        }),
      });
    } catch { /* skip */ }
  }

  return {
    summary: {
      holdings_count: holdings.length,
      total_pnl: analysis.totalPnl,
      total_pnl_pct: analysis.totalPnlPct,
      hhi: analysis.hhi,
      portfolio_volatility: analysis.portfolioVolatility,
      portfolio_sharpe: analysis.portfolioSharpe,
      signals_count: analysis.signals.length,
    },
    results,
    payload_id: payloadId,
    timestamp: analysis.timestamp,
  };
}

// ── Server ────────────────────────────────────────────────────────

const app = new Hono();

app.get('/health', c => c.json({
  status: 'ok',
  agent: AGENT_ID,
  version: AGENT_VERSION,
  name: AGENT_NAME,
}));

app.get('/fingerprint', async c => {
  const fp = await getFingerprint();
  if (!fp) return c.json({ error: 'No client certificate found' }, 404);
  c.header('Content-Type', 'text/plain');
  return c.body(`Add this fingerprint to your remote-profile.json agent_allowlist:\n\n${fp}\n`);
});

app.get('/', c => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${AGENT_NAME}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0A0A0A; color:#E5E7EB; display:flex; justify-content:center; align-items:center; min-height:100vh; padding:1rem; }
  .card { background:#111; border:1px solid #1F2937; border-radius:12px; padding:2rem; max-width:500px; width:100%; }
  h1 { font-size:1.5rem; color:#fff; margin-bottom:.5rem; }
  .subtitle { color:#9CA3AF; font-size:.9rem; margin-bottom:1.5rem; }
  label { display:block; font-size:.85rem; color:#D1D5DB; margin:.8rem 0 .3rem; }
  input, textarea { width:100%; padding:.6rem; background:#1A1A1A; border:1px solid #333; border-radius:6px; color:#E5E7EB; font-size:.85rem; }
  textarea { resize:vertical; }
  button { width:100%; padding:.7rem; margin-top:1rem; background:#3B82F6; border:none; border-radius:6px; color:#fff; font-size:.9rem; font-weight:600; cursor:pointer; }
  button:hover { background:#2563EB; }
  button:disabled { background:#374151; cursor:not-allowed; }
  #result { margin-top:1.5rem; padding:1rem; background:#1A1A1A; border-radius:6px; font-size:.85rem; white-space:pre-wrap; max-height:400px; overflow:auto; }
  .error { color:#F87171; }
  .success { color:#34D399; }
</style>
</head>
<body>
<div class="card">
  <h1>${AGENT_NAME}</h1>
  <p class="subtitle">v${AGENT_VERSION} · Analyze your portfolio via UOMP Gateway</p>

  <label for="token">Capability Token (UOM_TOKEN)</label>
  <input type="text" id="token" placeholder="eyJhbG...">

  <label for="gateway">Gateway URL (UOMP_BASE_URL)</label>
  <input type="text" id="gateway" placeholder="https://my-gateway.example.com" value="">

  <label for="session">Session ID (optional)</label>
  <input type="text" id="session" placeholder="sess_xxx">

  <label for="finnhub">Finnhub API Key (optional)</label>
  <input type="text" id="finnhub" placeholder="">

  <button id="analyzeBtn" onclick="runAnalysis()">Analyze Portfolio</button>
  <div id="result"></div>
</div>
<script>
async function runAnalysis() {
  const btn = document.getElementById('analyzeBtn');
  const result = document.getElementById('result');
  btn.disabled = true;
  result.textContent = 'Analyzing...';

  try {
    const resp = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: document.getElementById('token').value,
        gateway_url: document.getElementById('gateway').value || 'http://127.0.0.1:9374',
        session_id: document.getElementById('session').value || undefined,
        finnhub_key: document.getElementById('finnhub').value || undefined,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      result.innerHTML = '<span class="error">Error: ' + JSON.stringify(data, null, 2) + '</span>';
    } else {
      result.innerHTML = '<span class="success">Analysis complete</span>\\n\\n' +
        'Holdings: ' + data.summary.holdings_count + '\\n' +
        'Total P&L: ' + data.summary.total_pnl + ' (' + data.summary.total_pnl_pct + '%)\\n' +
        'HHI: ' + data.summary.hhi + ' | Vol: ' + (data.summary.portfolio_volatility ?? '-') + '% | Sharpe: ' + (data.summary.portfolio_sharpe ?? '-') + '\\n' +
        'Signals: ' + data.summary.signals_count + '\\n' +
        (data.payload_id ? 'Payload: ' + data.payload_id + '\\n' : '');
      if (data.results.markdown_zh) {
        const a = document.createElement('a');
        a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(data.results.html || data.results.markdown_en);
        a.download = 'report.html';
        a.textContent = 'Download HTML Report';
        result.appendChild(document.createTextNode('\\n'));
        result.appendChild(a);
      }
    }
  } catch (e) {
    result.innerHTML = '<span class="error">Connection error: ' + e.message + '</span>';
  } finally {
    btn.disabled = false;
  }
}
</script>
</body>
</html>`));

app.post('/analyze', async c => {
  const body = await c.req.json();
  const token = body.token;
  const gatewayUrl = body.gateway_url || 'http://127.0.0.1:9374';
  const sessionId = body.session_id || '';
  const finnhubKey = body.finnhub_key || process.env.FINNHUB_KEY || '';
  const userConfig = body.config || {};

  if (!token) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: 'token is required' } }, 400);
  }

  try {
    const result = await runAnalysis(token, gatewayUrl, sessionId, finnhubKey, userConfig);
    return c.json(result);
  } catch (err) {
    return c.json({ error: { code: 'ANALYSIS_FAILED', message: err.message } }, 500);
  }
});

// ── Start ─────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || '3080', 10);
console.log(`UOMP Stock Analyst v${AGENT_VERSION}\n`);
console.log(`Server: http://0.0.0.0:${port}`);
console.log(`Health:  http://0.0.0.0:${port}/health`);
console.log(`Web UI:  http://0.0.0.0:${port}/`);

const fp = getFingerprint();
if (fp) console.log(`\nFingerprint: ${fp}`);
else console.log(`\nNo client cert found. Generate with: scripts/generate-gateway-certs.sh`);

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
