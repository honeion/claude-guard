/**
 * Show token usage statistics
 */

import { getSessionStats, getPeriodStats, getTotalStats, getDailyBreakdown, formatStats } from '../lib/token-tracker.js';
import { initDb, getSession, getRecentSessions } from '../lib/db.js';

export async function stats(args) {
  await initDb();
  const options = parseArgs(args);

  if (options.session) {
    await showSessionStats(options.session);
  } else if (options.period) {
    await showPeriodStats(options.period);
  } else if (options.daily) {
    await showDailyBreakdown(parseInt(options.daily) || 7);
  } else {
    await showTotalStats();
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

async function showSessionStats(sessionId) {
  const { initDb } = await import('../lib/db.js');
  await initDb();

  // Find session with partial ID match
  const sessions = await getRecentSessions(100);
  const session = sessions.find(s => s.id.startsWith(sessionId));

  if (!session) {
    console.log(`세션을 찾을 수 없음: ${sessionId}`);
    return;
  }

  console.log('\n=== 세션 통계 ===\n');
  console.log(`세션 ID: ${session.id}`);
  console.log(`프로젝트: ${session.project_path || 'N/A'}`);
  console.log(`상태: ${session.status}`);
  console.log(`시작: ${new Date(session.started_at).toLocaleString()}`);
  console.log(`총 턴: ${session.total_turns}`);
  console.log('');

  const stats = await getSessionStats(session.id);
  console.log(formatStats(stats));
}

async function showPeriodStats(period) {
  console.log(`\n=== ${period} 통계 ===\n`);

  const stats = await getPeriodStats(period);
  console.log(formatStats(stats));
}

async function showTotalStats() {
  console.log('\n=== 전체 통계 ===\n');

  const stats = await getTotalStats();
  console.log(formatStats(stats));

  // Show recent sessions
  const recentSessions = await getRecentSessions(5);

  if (recentSessions.length > 0) {
    console.log('\n--- 최근 세션 ---\n');

    for (const s of recentSessions) {
      const date = new Date(s.started_at).toLocaleString();
      const project = s.project_path?.split(/[/\\]/).pop() || 'N/A';
      console.log(`  ${s.id.slice(0, 8)}  ${s.status.padEnd(10)}  ${s.total_turns} turns  ${project}  ${date}`);
    }
  }
}

async function showDailyBreakdown(days) {
  console.log(`\n=== 일별 통계 (최근 ${days}일) ===\n`);

  const breakdown = await getDailyBreakdown(days);

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
