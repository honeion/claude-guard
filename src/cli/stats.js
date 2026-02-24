/**
 * Show token usage statistics
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getSessionStats, getPeriodStats, getTotalStats, getDailyBreakdown, formatStats, calculateCost } from '../lib/token-tracker.js';
import { getRecentSessionsWithStats, getRecentSessions } from '../lib/db.js';

const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_DIR = join(GUARD_DIR, 'sessions');

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

  // Show turn-by-turn breakdown
  const turnsPath = join(SESSIONS_DIR, session.id, 'turns.jsonl');
  if (existsSync(turnsPath)) {
    try {
      const content = readFileSync(turnsPath, 'utf8');
      const turns = content.split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);

      if (turns.length > 0) {
        console.log('\n--- 채팅별 토큰 사용량 (delta) ---\n');
        console.log('시간                 | Δ Input    | Δ Output   | Δ Total    | 누적 Total | 도구');
        console.log('---------------------|------------|------------|------------|------------|------------');

        let prevInput = 0, prevOutput = 0;
        for (const turn of turns) {
          const time = turn.time ? new Date(turn.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
          const date = turn.time ? new Date(turn.time).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '';
          const deltaIn = Math.max(0, (turn.input || 0) - prevInput);
          const deltaOut = Math.max(0, (turn.output || 0) - prevOutput);
          const deltaTotal = deltaIn + deltaOut;
          const cumTotal = (turn.input || 0) + (turn.output || 0);
          const tool = (turn.tool || '-').slice(0, 10).padEnd(10);

          const dIn = `+${deltaIn.toLocaleString()}`.padStart(10);
          const dOut = `+${deltaOut.toLocaleString()}`.padStart(10);
          const dTot = `+${deltaTotal.toLocaleString()}`.padStart(10);
          const cum = cumTotal.toLocaleString().padStart(10);

          console.log(`${date} ${time}    | ${dIn} | ${dOut} | ${dTot} | ${cum} | ${tool}`);

          prevInput = turn.input || 0;
          prevOutput = turn.output || 0;
        }
      }
    } catch {}
  }
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
    console.log('\n--- 세션별 토큰 사용량 ---\n');
    console.log('ID        | 상태       | Input      | Output     | Total      | 비용       | 프로젝트');
    console.log('----------|------------|------------|------------|------------|------------|------------------');

    for (const s of recentSessions) {
      if (!s) continue;
      const id = s.id?.slice(0, 8) || '????????';
      const status = (s.status || 'unknown').slice(0, 10).padEnd(10);
      const input = (s.total_input || 0).toLocaleString().padStart(10);
      const output = (s.total_output || 0).toLocaleString().padStart(10);
      const total = ((s.total_input || 0) + (s.total_output || 0)).toLocaleString().padStart(10);
      const cost = calculateCost(s.total_input || 0, s.total_output || 0);
      const costStr = `$${cost.total.toFixed(4)}`.padStart(10);
      const project = s.project_path?.split(/[/\\]/).pop()?.slice(0, 16) || 'N/A';

      console.log(`${id}  | ${status} | ${input} | ${output} | ${total} | ${costStr} | ${project}`);
    }

    console.log('\n세션 상세: claude-guard stats --session=<ID>');
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
