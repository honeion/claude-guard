/**
 * Show claude-guard status
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { GUARD_DIR, getSessionCount, getTokenStats, getRecentSessions } from '../lib/db.js';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export function status() {
  try {
    console.log('\n=== claude-guard 상태 ===\n');

    // Check if hooks are enabled
    let hooksEnabled = false;
    try {
      if (existsSync(CLAUDE_SETTINGS_FILE)) {
        const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf8'));
        if (settings?.hooks) {
          hooksEnabled = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'].some(event =>
            settings.hooks[event]?.some(h =>
              h?.hooks?.some(hh => hh?.command?.includes('claude-guard'))
            )
          );
        }
      }
    } catch {}

    console.log(`Hooks: ${hooksEnabled ? '활성화됨' : '비활성화됨'}`);
    console.log(`데이터 디렉토리: ${GUARD_DIR}`);

    // Session stats
    const totalSessions = getSessionCount();
    const recentSessions = getRecentSessions(100);
    const activeSessions = recentSessions.filter(s => s?.status === 'active').length;
    const crashedSessions = recentSessions.filter(s => s?.status === 'crashed').length;

    console.log(`\n세션:`);
    console.log(`  전체: ${totalSessions}`);
    console.log(`  활성: ${activeSessions}`);
    console.log(`  크래시: ${crashedSessions}`);

    // Token stats
    const tokenStats = getTokenStats();
    const totalTokens = (tokenStats?.total_input || 0) + (tokenStats?.total_output || 0);
    console.log(`\n추적된 토큰: ${totalTokens.toLocaleString()}`);

    // Recent activity
    const lastSession = recentSessions?.[0];
    if (lastSession?.started_at) {
      console.log(`마지막 세션: ${new Date(lastSession.started_at).toLocaleString()}`);
    }
  } catch (err) {
    console.error(`상태 확인 오류: ${err?.message || '알 수 없음'}`);
  }
}
