/**
 * Token tracking utilities - File-based version
 */

import { getTokenStats, getSessionCount, getDailyStats } from './db.js';

// Pricing per 1M tokens
const PRICING = {
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'default': { input: 3.0, output: 15.0 }
};

export function calculateCost(inputTokens, outputTokens, model = 'default') {
  const pricing = PRICING[model] || PRICING['default'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return { input: inputCost, output: outputCost, total: inputCost + outputCost };
}

export function getSessionStats(sessionId) {
  const stats = getTokenStats(sessionId);
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);
  return { ...stats, cost_usd: cost.total.toFixed(4) };
}

export function getPeriodStats(period = 'day') {
  const now = Date.now();
  let fromDate;

  switch (period) {
    case 'day': fromDate = now - 24 * 60 * 60 * 1000; break;
    case 'week': fromDate = now - 7 * 24 * 60 * 60 * 1000; break;
    case 'month': fromDate = now - 30 * 24 * 60 * 60 * 1000; break;
    default: fromDate = 0;
  }

  const stats = getTokenStats(null, fromDate, now);
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);
  return { period, ...stats, cost_usd: cost.total.toFixed(4) };
}

export function getTotalStats() {
  const stats = getTokenStats();
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);
  const sessionCount = getSessionCount();
  return { sessions: sessionCount, ...stats, cost_usd: cost.total.toFixed(4) };
}

export function getDailyBreakdown(days = 7) {
  const daily = getDailyStats(days);
  return daily.map(d => {
    const cost = calculateCost(d.total_input || 0, d.total_output || 0);
    return {
      date: d.date,
      total_turns: d.sessions || 0,
      total_input: d.total_input || 0,
      total_output: d.total_output || 0,
      total_tokens: (d.total_input || 0) + (d.total_output || 0),
      cost_usd: cost.total.toFixed(4)
    };
  });
}

export function formatStats(stats) {
  const lines = [];
  if (stats.period) lines.push(`Period: ${stats.period}`);
  if (stats.sessions !== undefined) lines.push(`Sessions: ${stats.sessions}`);
  lines.push(`Total Turns: ${stats.total_turns || 0}`);
  lines.push(`Input Tokens: ${(stats.total_input || 0).toLocaleString()}`);
  lines.push(`Output Tokens: ${(stats.total_output || 0).toLocaleString()}`);
  lines.push(`Total Tokens: ${(stats.total_tokens || 0).toLocaleString()}`);
  lines.push(`Estimated Cost: $${stats.cost_usd}`);
  return lines.join('\n');
}
