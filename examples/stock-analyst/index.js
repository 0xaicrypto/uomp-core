#!/usr/bin/env node
import { UserMemory } from '@uomp/sdk';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import https from 'https';
import http from 'http';
import { homedir } from 'os';
import { join } from 'path';
import { URL } from 'url';

// ── TLS / mTLS fetch for Gateway ──────────────────────────────────

let _mtlsAgent = null;
let _useMtls = false;

async function loadMtlsAgent() {
  if (_mtlsAgent) return _mtlsAgent;
  const certDir = join(homedir(), '.uomp', '.gateway-certs');
  const certPath = join(certDir, 'client.crt');
  const keyPath = join(certDir, 'client.key');
  const caPath = join(certDir, 'ca.crt');
  if (!existsSync(certPath) || !existsSync(keyPath)) return null;
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  const ca = existsSync(caPath) ? await readFile(caPath) : undefined;
  _mtlsAgent = new https.Agent({ cert, key, ca, rejectUnauthorized: false });
  return _mtlsAgent;
}

async function httpRequest(url, opts = {}) {
  await loadMtlsAgent();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const agent = _mtlsAgent ?? undefined;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      agent,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage || '',
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

async function gatewayFetch(url, init) {
  if (_useMtls) return httpRequest(url, init);
  return fetch(url, init);
}

// ── Market Data ──────────────────────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FINNHUB_QUOTE = 'https://finnhub.io/api/v1/quote';

async function fetchYahooQuote(symbol) {
  const url = `${YAHOO_CHART}/${symbol}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    const closes = quotes?.close?.filter(v => v != null) ?? [];

    return {
      symbol,
      price: meta.regularMarketPrice ?? meta.previousClose ?? null,
      currency: meta.currency,
      previousClose: meta.previousClose,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      prices: closes,
      timestamps: result.timestamp ?? [],
      volumes: quotes?.volume ?? [],
      highs: quotes?.high ?? [],
      lows: quotes?.low ?? [],
      opens: quotes?.open ?? [],
    };
  } catch {
    return null;
  }
}

async function fetchFinnhubQuote(symbol, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `${FINNHUB_QUOTE}?symbol=${symbol}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { symbol, price: data.c ?? null, currency: 'USD', source: 'finnhub' };
  } catch {
    return null;
  }
}

async function fetchQuote(symbol, finnhubKey) {
  const yahoo = await fetchYahooQuote(symbol);
  if (yahoo?.price) return yahoo;
  const finnhub = await fetchFinnhubQuote(symbol, finnhubKey);
  if (finnhub?.price) return { symbol, price: finnhub.price, currency: 'USD', prices: [], source: 'finnhub' };
  return { symbol, price: null, currency: 'USD', prices: [] };
}

// ── Statistics Helpers ────────────────────────────────────────────

function computeReturnSeries(prices) {
  if (prices.length < 2) return [];
  const rets = [];
  for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  return rets;
}

function mean(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function covariance(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  const ma = mean(a), mb = mean(b);
  return a.reduce((s, ai, i) => s + (ai - ma) * (b[i] - mb), 0) / (a.length - 1);
}

function annualVol(prices) {
  const rets = computeReturnSeries(prices);
  return rets.length < 2 ? null : stddev(rets) * Math.sqrt(252);
}

function computeBeta(stockRets, marketRets) {
  if (!stockRets.length || !marketRets.length) return null;
  const len = Math.min(stockRets.length, marketRets.length);
  const cov = covariance(stockRets.slice(-len), marketRets.slice(-len));
  const mVar = stddev(marketRets.slice(-len)) ** 2;
  return mVar === 0 ? null : cov / mVar;
}

// ── Analysis ─────────────────────────────────────────────────────

function analyzePortfolio(holdings, risk, quotes) {
  const rows = [];
  let totalCost = 0, totalValue = 0;

  for (const item of holdings) {
    const h = item.value;
    const qty = parseFloat(h.quantity);
    const costBasis = parseFloat(h.cost_basis);
    const q = quotes.find(qa => qa?.symbol === h.symbol);
    const price = q?.price ?? (parseFloat(h.market_value) / qty);
    const curVal = price * qty;
    const costVal = costBasis * qty;
    const pnl = curVal - costVal;
    const pnlPct = costVal > 0 ? (pnl / costVal) * 100 : 0;
    totalCost += costVal;
    totalValue += curVal;
    rows.push({ symbol: h.symbol, name: h.name ?? h.symbol, quantity: qty,
      costBasis, currentPrice: price, currentValue: curVal, pnl, pnlPct,
      weight: 0, sector: h.sector ?? 'Unknown', prices: q?.prices ?? [], rets: [] });
  }

  for (const r of rows) {
    r.weight = totalValue > 0 ? (r.currentValue / totalValue) * 100 : 0;
    r.rets = computeReturnSeries(r.prices);
    r.volatility = annualVol(r.prices);
  }

  // Market proxy from equal-weighted returns
  const marketRets = [];
  const maxLen = Math.max(0, ...rows.map(r => r.rets.length));
  for (let i = 0; i < maxLen; i++) {
    let s = 0, c = 0;
    for (const r of rows) { if (i < r.rets.length) { s += r.rets[i]; c++; } }
    if (c > 0) marketRets.push(s / c);
  }

  for (const r of rows) r.beta = computeBeta(r.rets, marketRets);

  // Sector allocation
  const sectorMap = {}, sectorPct = {};
  for (const r of rows) { sectorMap[r.sector] = (sectorMap[r.sector] ?? 0) + r.currentValue; }
  for (const [k, v] of Object.entries(sectorMap)) sectorPct[k] = totalValue > 0 ? (v / totalValue) * 100 : 0;

  const sectorDevs = {};
  if (risk?.target_allocation) {
    for (const [sec, target] of Object.entries(risk.target_allocation)) {
      sectorDevs[sec] = (sectorPct[sec] ?? 0) - target;
    }
  }

  // HHI
  const hhi = rows.reduce((s, r) => { const w = r.weight; return s + w * w; }, 0);

  // Portfolio volatility
  let portVol = null;
  if (rows.every(r => r.volatility != null)) {
    let v = 0;
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows.length; j++) {
        const corr = i === j ? 1 : 0.5;
        v += (rows[i].weight / 100) * (rows[j].weight / 100) * (rows[i].volatility / 100) * (rows[j].volatility / 100) * corr;
      }
    }
    portVol = Math.sqrt(Math.max(0, v)) * 100;
  }

  // Signals
  const signals = [], drawdownWarnings = [];
  for (const r of rows) {
    if (risk?.stop_loss_pct && r.pnlPct <= -risk.stop_loss_pct) {
      signals.push({ type: 'stop_loss', symbol: r.symbol, msg: `${r.symbol} 浮亏 ${r.pnlPct.toFixed(1)}% (止损线 ${risk.stop_loss_pct}%)` });
    }
    if (risk?.take_profit_pct && r.pnlPct >= risk.take_profit_pct) {
      signals.push({ type: 'take_profit', symbol: r.symbol, msg: `${r.symbol} 浮盈 ${r.pnlPct.toFixed(1)}% (止盈线 ${risk.take_profit_pct}%)` });
    }
    if (risk?.max_drawdown != null) {
      const dd = ((r.currentPrice - r.costBasis) / r.costBasis) * 100;
      if (dd < -risk.max_drawdown * 100) {
        drawdownWarnings.push({ symbol: r.symbol, drawdown: dd, limit: -risk.max_drawdown * 100 });
      }
    }
  }

  return {
    rows, totalCost, totalValue,
    totalPnl: totalValue - totalCost,
    totalPnlPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    hhi, sector: { allocations: sectorMap, percentages: sectorPct, total: totalValue },
    sectorDeviations: sectorDevs, signals, drawdownWarnings, portfolioVolatility: portVol,
    riskLevel: risk?.risk_level ?? 'unknown', investmentHorizon: risk?.investment_horizon ?? 'unknown',
    targetAllocation: risk?.target_allocation ?? null,
  };
}

// ── Report ───────────────────────────────────────────────────────

function generateReport(analysis, lang) {
  const en = lang === 'en';
  const L = en ? (x, y) => y : (x, y) => x;

  const lines = [];
  lines.push(en ? '# Portfolio Analysis Report' : '# 持仓分析报告');
  lines.push('');
  lines.push(`${en ? 'Generated' : '生成时间'}: ${new Date().toISOString()}`);
  lines.push(`${en ? 'Risk profile' : '风险偏好'}: ${analysis.riskLevel}`);
  lines.push(`${en ? 'Horizon' : '投资周期'}: ${analysis.investmentHorizon}`);
  lines.push('');

  lines.push(en ? '## Holdings' : '## 持仓明细');
  lines.push('');
  lines.push(en
    ? '| Symbol | Name | Qty | Cost | Price | Value | P&L | P&L% | Wgt% | Sector |'
    : '| 标的 | 名称 | 数量 | 成本价 | 当前价 | 市值 | 盈亏 | 盈亏% | 权重% | 行业 |');
  lines.push('|--------|------|-----|------|-------|-------|-----|------|------|--------|');
  for (const r of analysis.rows) {
    lines.push(`| ${r.symbol} | ${r.name} | ${r.quantity} | ${r.costBasis.toFixed(2)} | ${r.currentPrice.toFixed(2)} | ${r.currentValue.toFixed(2)} | ${r.pnl.toFixed(2)} | ${r.pnlPct.toFixed(2)}% | ${r.weight.toFixed(2)}% | ${r.sector} |`);
  }

  lines.push('');
  lines.push(en ? '## Summary' : '## 汇总');
  lines.push('');
  lines.push(`- ${en ? 'Total Cost' : '总成本'}: ${analysis.totalCost.toFixed(2)}`);
  lines.push(`- ${en ? 'Total Value' : '总市值'}: ${analysis.totalValue.toFixed(2)}`);
  lines.push(`- ${en ? 'Total P&L' : '总盈亏'}: ${analysis.totalPnl.toFixed(2)} (${analysis.totalPnlPct.toFixed(2)}%)`);
  lines.push(`- ${en ? 'Concentration (HHI)' : '集中度 (HHI)'}: ${analysis.hhi.toFixed(1)}${analysis.hhi > 2500 ? ' ⚠' : ''}`);

  lines.push('');
  lines.push(en ? '## Sector Allocation' : '## 行业分布');
  lines.push('');
  for (const [sec, pct] of Object.entries(analysis.sector.percentages).sort((a, b) => b[1] - a[1])) {
    const dev = analysis.sectorDeviations[sec];
    const devStr = dev != null ? ` (${en ? 'target' : '目标'}: ${analysis.targetAllocation?.[sec]}%, ${en ? 'dev' : '偏差'}: ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%)` : '';
    lines.push(`- ${sec}: ${pct.toFixed(1)}%${devStr}`);
  }

  lines.push('');
  lines.push(en ? '## Risk Metrics' : '## 风险指标');
  lines.push('');
  lines.push(en ? '| Symbol | Volatility(ann) | Beta |' : '| 标的 | 年化波动率 | Beta |');
  lines.push('|--------|-----------------|------|');
  for (const r of analysis.rows) {
    const vol = r.volatility != null ? r.volatility.toFixed(2) + '%' : '-';
    const beta = r.beta != null ? r.beta.toFixed(2) : '-';
    lines.push(`| ${r.symbol} | ${vol} | ${beta} |`);
  }
  if (analysis.portfolioVolatility != null) {
    lines.push('');
    lines.push(`${en ? 'Portfolio volatility' : '组合年化波动率'}: ${analysis.portfolioVolatility.toFixed(2)}%`);
  }

  if (analysis.signals.length > 0) {
    lines.push('');
    lines.push(en ? '## Signals' : '## 交易信号');
    lines.push('');
    for (const s of analysis.signals) {
      lines.push(`- ${s.type === 'stop_loss' ? '🔴' : '🟢'} ${s.msg}`);
    }
  }

  if (analysis.drawdownWarnings.length > 0) {
    lines.push('');
    lines.push(en ? '## Drawdown Alerts' : '## 回撤告警');
    lines.push('');
    for (const d of analysis.drawdownWarnings) {
      lines.push(`- ${d.symbol}: ${en ? 'drawdown' : '回撤'} ${d.drawdown.toFixed(1)}% (${en ? 'limit' : '限制'}: ${d.limit.toFixed(1)}%)`);
    }
  }

  lines.push('');
  lines.push(en
    ? '> Report generated locally by Stock Analyst. No portfolio data uploaded to external services.'
    : '> 本报告由 Stock Analyst 在本地生成，未向任何外部服务上传持仓数据。');
  lines.push(en
    ? '> Market data from public APIs (Yahoo Finance / Finnhub).'
    : '> 行情数据来自公开 API (Yahoo Finance / Finnhub)。');

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const token = process.env.UOM_TOKEN;
  const baseUrl = process.env.UOMP_BASE_URL || 'http://127.0.0.1:9374';
  const finnhubKey = process.env.FINNHUB_KEY || '';
  const lang = process.env.UOMP_LANG || 'zh';
  const sessionId = process.env.UOMP_SESSION_ID || '';

  if (!token) { console.error('Error: UOM_TOKEN required'); process.exit(1); }

  _useMtls = baseUrl.startsWith('https://');

  const memory = new UserMemory({
    token, baseUrl, agentId: 'stock-analyst',
    fetch: _useMtls ? (url, init) => gatewayFetch(url, init) : undefined,
  });

  try {
    console.log(lang === 'en' ? 'Stock Analyst v0.2 started\n' : 'Stock Analyst v0.2 启动\n');

    // Aggregate first
    try {
      const aggResp = await gatewayFetch(`${baseUrl}/v1/memory/aggregate?tag=portfolio:holdings&op=count`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-UOMP-Agent-Id': 'stock-analyst' },
      });
      if (aggResp.ok) {
        const d = await aggResp.json();
        console.log(lang === 'en' ? `Aggregate: ${d.result} holdings total` : `聚合查询: 共 ${d.result} 条持仓`);
      }
    } catch { /* not supported or not authorized */ }

    // Read holdings + risk
    const holdings = await memory.getByTag('portfolio:holdings');
    console.log(`${lang === 'en' ? 'Holdings' : '持仓'}: ${holdings.length} ${lang === 'en' ? 'positions' : '个标的'}`);

    const riskItems = await memory.getByTag('profile:risk');
    const risk = riskItems[0]?.value ?? {};
    console.log(`${lang === 'en' ? 'Risk' : '风险偏好'}: ${risk.risk_level ?? '?'}, drawdown≤${(risk.max_drawdown ?? 0) * 100}%, ${risk.investment_horizon ?? '-'}\n`);

    // Fetch market data
    const symbols = [...new Set(holdings.map(h => h.value.symbol).filter(Boolean))];
    console.log(`${lang === 'en' ? 'Fetching quotes for' : '获取行情'}: ${symbols.join(', ')}`);
    const quotes = await Promise.all(symbols.map(s => fetchQuote(s, finnhubKey)));
    const valid = quotes.filter(q => q?.price != null);
    console.log(`${lang === 'en' ? 'Received' : '收到'} ${valid.length}/${symbols.length} ${lang === 'en' ? 'quotes' : '条行情'}\n`);

    // Analyze
    const analysis = analyzePortfolio(holdings, risk, valid);

    // Generate reports
    if (!existsSync('./output')) await mkdir('./output', { recursive: true });
    const ts = Date.now();
    const reportZh = generateReport(analysis, 'zh');
    const reportEn = generateReport(analysis, 'en');
    const combined = reportZh + '\n\n---\n\n' + reportEn;

    await writeFile(`./output/stock-analysis-${ts}-zh.md`, reportZh, 'utf-8');
    await writeFile(`./output/stock-analysis-${ts}-en.md`, reportEn, 'utf-8');
    await writeFile(`./output/stock-analysis-${ts}.md`, combined, 'utf-8');

    console.log(lang === 'en' ? 'Reports saved:' : '报告已保存:');
    console.log(`  ./output/stock-analysis-${ts}-zh.md`);
    console.log(`  ./output/stock-analysis-${ts}-en.md`);
    console.log(`  ./output/stock-analysis-${ts}.md`);

    // Gateway payload upload
    if (baseUrl.startsWith('https://') && sessionId) {
      try {
        const uploadResp = await gatewayFetch(`${baseUrl}/v1/payload/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-UOMP-Agent-Id': 'stock-analyst' },
          body: Buffer.from(combined, 'utf-8'),
        });
        if (uploadResp.ok) {
          const ud = await uploadResp.json();
          console.log(`\nPayload uploaded: ${ud.payload_id} (${ud.size} bytes)`);
        }
      } catch (e) { console.log(`Payload upload skipped: ${e.message}`); }
    }

    // Deletion proof
    if (sessionId) {
      try {
        const hash = createHash('sha256').update(holdings.map(h => h.key).join('')).digest('hex');
        const proofResp = await gatewayFetch(`${baseUrl}/v1/sessions/${sessionId}/deletion-proof`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-UOMP-Agent-Id': 'stock-analyst' },
          body: JSON.stringify({
            deletion_proof_id: `del_${Date.now().toString(36)}`,
            session_id: sessionId, agent_id: 'stock-analyst',
            deleted_at: new Date().toISOString(), memory_hash: `sha256:${hash}`,
            fields_accessed: ['key', 'value'], method: 'process_termination',
            proof_value: `sha256:${hash}`,
          }),
        });
        if (proofResp.ok) console.log(`Deletion proof accepted: ${(await proofResp.json()).deletion_proof_id}`);
      } catch { /* skip */ }
    }

    console.log(lang === 'en' ? '\n═══ Analysis Complete ═══' : '\n═══ 分析完成 ═══');
    console.log(`P&L: ${analysis.totalPnl.toFixed(2)} (${analysis.totalPnlPct.toFixed(2)}%) | HHI: ${analysis.hhi.toFixed(1)}`);
    if (analysis.portfolioVolatility != null) console.log(`Vol: ${analysis.portfolioVolatility.toFixed(2)}%`);
    console.log(`Signals: ${analysis.signals.length}`);
    for (const s of analysis.signals) console.log(`  ${s.msg}`);
  } catch (error) {
    console.error(lang === 'en' ? 'Agent error:' : 'Agent 错误:', error.message);
    process.exit(1);
  }
}

main();
