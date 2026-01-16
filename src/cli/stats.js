/**
 * Show token usage statistics
 */

import { getSessionStats, getPeriodStats, getTotalStats, getDailyBreakdown, formatStats } from '../lib/token-tracker.js';
import { initDb, getRecentSessions } from '../lib/db.js';

export async function stats(args = []) {
  try {
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
  } catch (err) {
    console.error(`오류: ${err?.message || '알 수 없는 오류'}`);
  }
}

function parseArgs(args) {
  const options = {};

  if (!Array.isArray(args)) return options;

  for (const arg of args) {
    if (!arg || typeof arg !== 'string') continue;

    if (arg.startsWith('--session=')) {
      options.session = arg.split('=')[1] || '';
    } else if (arg.startsWith('--period=')) {
      options.period = arg.split('=')[1] || 'day';
    } else if (arg.startsWith('--daily')) {
      options.daily = arg.split('=')[1] || '7';
    }
  }

  return options;
}

async function showSessionStats(sessionId) {
  try {
    if (!sessionId) {
      console.log('세션 ID를 지정해주세요.');
      return;
    }

    // Find session with partial ID match
    const sessions = await getRecentSessions(100);
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
    console.log(`총 턴: ${session.total_turns || 0}`);
    console.log('');

    const stats = await getSessionStats(session.id);
    console.log(formatStats(stats));
  } catch (err) {
    console.error(`세션 통계 오류: ${err?.message || '알 수 없음'}`);
  }
}

async function showPeriodStats(period) {
  try {
    console.log(`\n=== ${period || 'day'} 통계 ===\n`);
    const stats = await getPeriodStats(period);
    console.log(formatStats(stats));
  } catch (err) {
    console.error(`기간 통계 오류: ${err?.message || '알 수 없음'}`);
  }
}

async function showTotalStats() {
  try {
    console.log('\n=== 전체 통계 ===\n');

    const stats = await getTotalStats();
    console.log(formatStats(stats));

    // Show recent sessions
    const recentSessions = await getRecentSessions(5);

    if (recentSessions && recentSessions.length > 0) {
      console.log('\n--- 최근 세션 ---\n');

      for (const s of recentSessions) {
        if (!s) continue;
        const date = s.started_at ? new Date(s.started_at).toLocaleString() : 'N/A';
        const project = s.project_path?.split(/[/\\]/).pop() || 'N/A';
        const id = s.id?.slice(0, 8) || '????????';
        const status = (s.status || 'unknown').padEnd(10);
        const turns = s.total_turns || 0;
        console.log(`  ${id}  ${status}  ${turns} turns  ${project}  ${date}`);
      }
    }
  } catch (err) {
    console.error(`전체 통계 오류: ${err?.message || '알 수 없음'}`);
  }
}

async function showDailyBreakdown(days) {
  try {
    const numDays = days || 7;
    console.log(`\n=== 일별 통계 (최근 ${numDays}일) ===\n`);

    const breakdown = await getDailyBreakdown(numDays);

    if (!breakdown || breakdown.length === 0) {
      console.log('데이터가 없습니다.');
      return;
    }

    console.log('Date        | Turns | Input    | Output   | Total    | Cost');
    console.log('------------|-------|----------|----------|----------|-------');

    for (const day of breakdown) {
      if (!day) continue;
      const date = day.date || 'N/A';
      const turns = (day.total_turns || 0).toString().padStart(5);
      const input = (day.total_input || 0).toLocaleString().padStart(8);
      const output = (day.total_output || 0).toLocaleString().padStart(8);
      const total = (day.total_tokens || 0).toLocaleString().padStart(8);
      const cost = `$${day.cost_usd || '0.0000'}`.padStart(6);

      console.log(`${date} | ${turns} | ${input} | ${output} | ${total} | ${cost}`);
    }
  } catch (err) {
    console.error(`일별 통계 오류: ${err?.message || '알 수 없음'}`);
  }
}
