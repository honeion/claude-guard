/**
 * Show claude-guard status
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initDb, GUARD_DIR, getSessionCount, getTokenStats, getRecentSessions } from '../lib/db.js';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export async function status() {
  try {
    console.log('\n=== claude-guard 상태 ===\n');

    // Check if hooks are enabled
    let hooksEnabled = false;
    try {
      if (existsSync(CLAUDE_SETTINGS_FILE)) {
        const content = readFileSync(CLAUDE_SETTINGS_FILE, 'utf8');
        if (content && content.trim()) {
          const settings = JSON.parse(content);
          if (settings?.hooks) {
            const hasOurHooks = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'].some(event =>
              settings.hooks[event]?.some(h =>
                h?.hooks?.some(hh => hh?.command?.includes('claude-guard') || hh?.command?.includes('index.js'))
              )
            );
            hooksEnabled = hasOurHooks;
          }
        }
      }
    } catch {
      // Ignore settings read errors
    }

    console.log(`Hooks: ${hooksEnabled ? '활성화됨' : '비활성화됨'}`);
    console.log(`데이터 디렉토리: ${GUARD_DIR}`);

    // Initialize DB and get stats
    await initDb();

    let totalSessions = 0;
    let activeSessions = 0;
    let crashedSessions = 0;

    try {
      totalSessions = await getSessionCount();
      const recentSessions = await getRecentSessions(100);
      if (Array.isArray(recentSessions)) {
        activeSessions = recentSessions.filter(s => s?.status === 'active').length;
        crashedSessions = recentSessions.filter(s => s?.status === 'crashed').length;
      }
    } catch {
      // Ignore session count errors
    }

    console.log(`\n세션:`);
    console.log(`  전체: ${totalSessions}`);
    console.log(`  활성: ${activeSessions}`);
    console.log(`  크래시: ${crashedSessions}`);

    // Token stats
    try {
      const tokenStats = await getTokenStats();
      const totalTokens = (tokenStats?.total_input || 0) + (tokenStats?.total_output || 0);
      console.log(`\n추적된 토큰: ${totalTokens.toLocaleString()}`);
    } catch {
      console.log(`\n추적된 토큰: 0`);
    }

    // Recent activity
    try {
      const recentSessions = await getRecentSessions(1);
      const lastSession = recentSessions?.[0];
      if (lastSession?.started_at) {
        console.log(`\n마지막 세션: ${new Date(lastSession.started_at).toLocaleString()}`);
      }
    } catch {
      // Ignore
    }
  } catch (err) {
    console.error(`상태 확인 오류: ${err?.message || '알 수 없음'}`);
  }
}
