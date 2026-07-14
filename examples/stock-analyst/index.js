#!/usr/bin/env node
import { UserMemory } from '@uomp/sdk';
import { writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

async function fetchQuote(symbol) {
  // Use Yahoo Finance unofficial API for demo purposes only.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
    return {
      symbol,
      price,
      currency: meta.currency,
      previousClose: meta.previousClose,
    };
  } catch (err) {
    console.error(`Failed to fetch quote for ${symbol}:`, err.message);
    return null;
  }
}

function analyzePortfolio(holdings, risk, quotes) {
  let totalCost = 0;
  let totalValue = 0;
  const rows = [];

  for (const item of holdings) {
    const h = item.value;
    const quantity = Number(h.quantity);
    const costBasis = Number(h.cost_basis);
    const marketValue = Number(h.market_value);
    const quote = quotes.find(q => q && q.symbol === h.symbol);
    const currentPrice = quote?.price ?? (marketValue / quantity);
    const currentValue = currentPrice * quantity;
    const costValue = costBasis * quantity;
    const pnl = currentValue - costValue;
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
    totalCost += costValue;
    totalValue += currentValue;

    rows.push({
      symbol: h.symbol,
      quantity,
      costBasis,
      currentPrice,
      currentValue,
      pnl,
      pnlPct,
      weight: 0,
    });
  }

  for (const row of rows) {
    row.weight = totalValue > 0 ? (row.currentValue / totalValue) * 100 : 0;
  }

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  let suggestion = 'Hold';
  if (risk?.risk_level === 'conservative' && totalPnlPct < -5) {
    suggestion = 'Consider reducing exposure to underperforming positions';
  } else if (risk?.risk_level === 'aggressive' && totalPnlPct > 10) {
    suggestion = 'Consider taking partial profits';
  }

  return { rows, totalCost, totalValue, totalPnl, totalPnlPct, suggestion, riskLevel: risk?.risk_level };
}

async function main() {
  const token = process.env.UOM_TOKEN;
  const baseUrl = process.env.UOMP_BASE_URL || 'http://127.0.0.1:9374';

  if (!token) {
    console.error('Error: UOM_TOKEN environment variable is required');
    process.exit(1);
  }

  const memory = new UserMemory({ token, baseUrl });

  try {
    console.log('Stock Analyst started\n');

    const holdings = await memory.getByTag('portfolio:holdings');
    console.log(`Read ${holdings.length} holdings`);

    const riskItems = await memory.getByTag('profile:risk');
    const risk = riskItems[0]?.value ?? {};
    console.log(`Risk profile: ${risk.risk_level ?? 'unknown'}\n`);

    const symbols = holdings.map(h => h.value.symbol).filter(Boolean);
    console.log(`Fetching market data for: ${symbols.join(', ')}`);
    const quotes = await Promise.all(symbols.map(fetchQuote));
    const validQuotes = quotes.filter(Boolean);
    console.log(`Received ${validQuotes.length} quotes\n`);

    const analysis = analyzePortfolio(holdings, risk, validQuotes);

    const lines = [
      '# 持仓分析报告',
      '',
      `生成时间: ${new Date().toISOString()}`,
      `风险偏好: ${analysis.riskLevel ?? 'unknown'}`,
      '',
      '## 持仓明细',
      '',
      '| 标的 | 数量 | 成本价 | 当前价 | 市值 | 盈亏 | 盈亏% | 权重% |',
      '|------|------|--------|--------|------|------|-------|-------|',
    ];

    for (const row of analysis.rows) {
      lines.push(
        `| ${row.symbol} | ${row.quantity} | ${row.costBasis?.toFixed(2) ?? '-'} | ${row.currentPrice?.toFixed(2) ?? '-'} | ${row.currentValue.toFixed(2)} | ${row.pnl.toFixed(2)} | ${row.pnlPct.toFixed(2)}% | ${row.weight.toFixed(2)}% |`
      );
    }

    lines.push(
      '',
      '## 汇总',
      '',
      `- 总成本: ${analysis.totalCost.toFixed(2)}`,
      `- 总市值: ${analysis.totalValue.toFixed(2)}`,
      `- 总盈亏: ${analysis.totalPnl.toFixed(2)} (${analysis.totalPnlPct.toFixed(2)}%)`,
      '',
      '## 建议',
      '',
      analysis.suggestion,
      '',
      '> 本报告由 Stock Analyst 在本地生成，未上传至任何外部服务。'
    );

    const report = lines.join('\n');

    if (!existsSync('./output')) {
      mkdirSync('./output');
    }
    const outputPath = `./output/stock-analysis-${Date.now()}.md`;
    await writeFile(outputPath, report, 'utf-8');

    console.log('Analysis complete:');
    console.log(`  Total P&L: ${analysis.totalPnl.toFixed(2)} (${analysis.totalPnlPct.toFixed(2)}%)`);
    console.log(`  Report saved to: ${outputPath}`);
  } catch (error) {
    console.error('Agent error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

main();
