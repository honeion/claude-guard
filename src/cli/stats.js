/**
 * Show token usage statistics
 */

import { getSessionStats, getPeriodStats, getTotalStats, getDailyBreakdown, formatStats } from '../lib/token-tracker.js';
import { getRecentSessionsWithStats, getRecentSessions } from '../lib/db.js';

export function stats(args = []) {
  try {
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
  } catch (err) {
    console.error(`오류: ${err?.message || '알 수 없는 오류'}`);
  }
}

function parseArgs(args) {
  const options = {};
  if (!Array.isArray(args)) return options;

  for (const arg of args) {
    if (!arg || typeof arg !== 'string') continue;
    if (arg.startsWith('--session=')) options.session = arg.split('=')[1] || '';
    else if (arg.startsWith('--period=')) options.period = arg.split('=')[1] || 'day';
    else if (arg.startsWith('--daily')) options.daily = arg.split('=')[1] || '7';
  }
  return options;
}

function showSessionStats(sessionId) {
  if (!sessionId) {
    console.log('세션 ID를 지정해주세요.');
    return;
  }

  const sessions = getRecentSessions(100);
  const session = sessions.find(s => s?.id?.startsWith(sessionId));

  if (!session) {
    console.log(`세션을 찾을 수 없음: ${sessionId}`);
    return;
  }

  console.log('\n=== 세션 통계 ===\n');
  console.log(`세션 ID: ${session.id}`);
  console.log(`프로젝트: ${session.project_path || 'N/A'}`);
  console.log(`상태: ${session.status || 'unknown'}`);
  console.log(`시작: ${session.started_at ? new Date(session.started_at).toLocaleString() : 'N/A'}`);
  console.log('');

  const stats = getSessionStats(session.id);
  console.log(formatStats(stats));
}

function showPeriodStats(period) {
  console.log(`\n=== ${period || 'day'} 통계 ===\n`);
  const stats = getPeriodStats(period);
  console.log(formatStats(stats));
}

function showTotalStats() {
  console.log('\n=== 전체 통계 ===\n');

  const stats = getTotalStats();
  console.log(formatStats(stats));

  const recentSessions = getRecentSessionsWithStats(10);

  if (recentSessions && recentSessions.length > 0) {
    console.log('\n--- 최근 세션 ---\n');
    console.log('ID        Status      Tokens       Project');
    console.log('--------  ----------  -----------  --------------------------------');

    for (const s of recentSessions) {
      if (!s) continue;
      const id = s.id?.slice(0, 8) || '????????';
      const status = (s.status || 'unknown').padEnd(10);
      const totalTokens = ((s.total_input || 0) + (s.total_output || 0)).toLocaleString().padStart(11);
      const project = s.project_path?.split(/[/\\]/).pop()?.slice(0, 32) || 'N/A';

      console.log(`${id}  ${status}  ${totalTokens}  ${project}`);
    }
  }
}

function showDailyBreakdown(days) {
  const numDays = days || 7;
  console.log(`\n=== 일별 통계 (최근 ${numDays}일) ===\n`);

  const breakdown = getDailyBreakdown(numDays);

  if (!breakdown || breakdown.length === 0) {
    console.log('데이터가 없습니다.');
    return;
  }

  console.log('Date        | Input    | Output   | Total    | Cost');
  console.log('------------|----------|----------|----------|-------');

  for (const day of breakdown) {
    if (!day) continue;
    const date = day.date || 'N/A';
    const input = (day.total_input || 0).toLocaleString().padStart(8);
    const output = (day.total_output || 0).toLocaleString().padStart(8);
    const total = (day.total_tokens || 0).toLocaleString().padStart(8);
    const cost = `$${day.cost_usd || '0.0000'}`.padStart(6);

    console.log(`${date} | ${input} | ${output} | ${total} | ${cost}`);
  }
}
