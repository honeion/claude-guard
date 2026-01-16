/**
 * Token tracking utilities
 */

import { initDb, getTokenStats, addTokenUsage, getSessionCount, getRecentSessions } from './db.js';

// Pricing per 1M tokens (Claude 3.5 Sonnet estimates)
const PRICING = {
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'default': { input: 3.0, output: 15.0 }
};

// Calculate cost in USD
export function calculateCost(inputTokens, outputTokens, model = 'default') {
  const pricing = PRICING[model] || PRICING['default'];

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost
  };
}

// Track token usage
export async function trackTokens(sessionId, turn, inputTokens, outputTokens, model) {
  await addTokenUsage(sessionId, turn, inputTokens, outputTokens, model);
}

// Get stats for a session
export async function getSessionStats(sessionId) {
  const stats = await getTokenStats(sessionId);
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);

  return {
    ...stats,
    cost_usd: cost.total.toFixed(4)
  };
}

// Get stats for a time period
export async function getPeriodStats(period = 'day') {
  const now = Date.now();
  let fromDate;

  switch (period) {
    case 'day':
      fromDate = now - (24 * 60 * 60 * 1000);
      break;
    case 'week':
      fromDate = now - (7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      fromDate = now - (30 * 24 * 60 * 60 * 1000);
      break;
    default:
      fromDate = 0;
  }

  const stats = await getTokenStats(null, fromDate, now);
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);

  return {
    period,
    ...stats,
    cost_usd: cost.total.toFixed(4)
  };
}

// Get all-time stats
export async function getTotalStats() {
  const stats = await getTokenStats();
  const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);
  const sessionCount = await getSessionCount();

  return {
    sessions: sessionCount,
    ...stats,
    cost_usd: cost.total.toFixed(4)
  };
}

// Get daily breakdown
export async function getDailyBreakdown(days = 7) {
  const results = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < days; i++) {
    const dayStart = now - ((i + 1) * dayMs);
    const dayEnd = now - (i * dayMs);

    const stats = await getTokenStats(null, dayStart, dayEnd);
    const cost = calculateCost(stats.total_input || 0, stats.total_output || 0);

    results.push({
      date: new Date(dayEnd).toISOString().split('T')[0],
      ...stats,
      cost_usd: cost.total.toFixed(4)
    });
  }

  return results.reverse();
}

// Format stats for display
export function formatStats(stats) {
  const lines = [];

  if (stats.period) {
    lines.push(`Period: ${stats.period}`);
  }
  if (stats.sessions !== undefined) {
    lines.push(`Sessions: ${stats.sessions}`);
  }

  lines.push(`Total Turns: ${stats.total_turns || 0}`);
  lines.push(`Input Tokens: ${(stats.total_input || 0).toLocaleString()}`);
  lines.push(`Output Tokens: ${(stats.total_output || 0).toLocaleString()}`);
  lines.push(`Total Tokens: ${(stats.total_tokens || 0).toLocaleString()}`);
  lines.push(`Estimated Cost: $${stats.cost_usd}`);

  return lines.join('\n');
}
