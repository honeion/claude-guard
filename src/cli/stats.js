/**
 * Show token usage statistics
 */

import { getSessionStats, getPeriodStats, getTotalStats, getDailyBreakdown, formatStats } from '../lib/token-tracker.js';
import { db } from '../lib/db.js';

export async function stats(args) {
  const options = parseArgs(args);

  if (options.session) {
    showSessionStats(options.session);
  } else if (options.period) {
    showPeriodStats(options.period);
  } else if (options.daily) {
    showDailyBreakdown(parseInt(options.daily) || 7);
  } else {
    showTotalStats();
  }
}

function parseArgs(args) {
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--session=')) {
      options.session = arg.split('=')[1];
    } else if (arg.startsWith('--period=')) {
      options.period = arg.split('=')[1];
    } else if (arg.startsWith('--daily')) {
      options.daily = arg.split('=')[1] || '7';
    }
  }

  return options;
}

function showSessionStats(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id LIKE ?').get(`${sessionId}%`);

  if (!session) {
    console.log(`Session not found: ${sessionId}`);
    return;
  }

  console.log('\n=== Session Stats ===\n');
  console.log(`Session ID: ${session.id}`);
  console.log(`Project: ${session.project_path || 'N/A'}`);
  console.log(`Status: ${session.status}`);
  console.log(`Started: ${new Date(session.started_at).toLocaleString()}`);
  if (session.ended_at) {
    console.log(`Ended: ${new Date(session.ended_at).toLocaleString()}`);
  }
  console.log(`Total Turns: ${session.total_turns}`);
  console.log('');

  const stats = getSessionStats(session.id);
  console.log(formatStats(stats));
}

function showPeriodStats(period) {
  console.log(`\n=== ${period.charAt(0).toUpperCase() + period.slice(1)} Stats ===\n`);

  const stats = getPeriodStats(period);
  console.log(formatStats(stats));
}

function showTotalStats() {
  console.log('\n=== Total Stats ===\n');

  const stats = getTotalStats();
  console.log(formatStats(stats));

  // Show recent sessions
  const recentSessions = db.prepare(`
    SELECT id, project_path, status, started_at, total_turns
    FROM sessions
    ORDER BY started_at DESC
    LIMIT 5
  `).all();

  if (recentSessions.length > 0) {
    console.log('\n--- Recent Sessions ---\n');

    for (const s of recentSessions) {
      const date = new Date(s.started_at).toLocaleString();
      const project = s.project_path?.split(/[/\\]/).pop() || 'N/A';
      console.log(`  ${s.id.slice(0, 8)}  ${s.status.padEnd(10)}  ${s.total_turns} turns  ${project}  ${date}`);
    }
  }
}

function showDailyBreakdown(days) {
  console.log(`\n=== Daily Breakdown (Last ${days} days) ===\n`);

  const breakdown = getDailyBreakdown(days);

  console.log('Date        | Turns | Input    | Output   | Total    | Cost');
  console.log('------------|-------|----------|----------|----------|-------');

  for (const day of breakdown) {
    const date = day.date;
    const turns = (day.total_turns || 0).toString().padStart(5);
    const input = (day.total_input || 0).toLocaleString().padStart(8);
    const output = (day.total_output || 0).toLocaleString().padStart(8);
    const total = (day.total_tokens || 0).toLocaleString().padStart(8);
    const cost = `$${day.cost_usd}`.padStart(6);

    console.log(`${date} | ${turns} | ${input} | ${output} | ${total} | ${cost}`);
  }
}
