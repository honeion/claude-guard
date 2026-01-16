/**
 * Show claude-guard status
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initDb, GUARD_DIR, getSessionCount, getTokenStats, getRecentSessions } from '../lib/db.js';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export async function status() {
  console.log('\n=== claude-guard 상태 ===\n');

  // Check if hooks are enabled
  let hooksEnabled = false;
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf8'));
      if (settings.hooks) {
        const hasOurHooks = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'].some(event =>
          settings.hooks[event]?.some(h =>
            h.hooks?.some(hh => hh.command?.includes('claude-guard') || hh.command?.includes('index.js'))
          )
        );
        hooksEnabled = hasOurHooks;
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`Hooks: ${hooksEnabled ? '활성화됨' : '비활성화됨'}`);
  console.log(`데이터 디렉토리: ${GUARD_DIR}`);

  // Initialize DB and get stats
  await initDb();

  const totalSessions = await getSessionCount();
  const recentSessions = await getRecentSessions(100);
  const activeSessions = recentSessions.filter(s => s.status === 'active').length;
  const crashedSessions = recentSessions.filter(s => s.status === 'crashed').length;

  console.log(`\n세션:`);
  console.log(`  전체: ${totalSessions}`);
  console.log(`  활성: ${activeSessions}`);
  console.log(`  크래시: ${crashedSessions}`);

  // Token stats
  const tokenStats = await getTokenStats();
  const totalTokens = (tokenStats.total_input || 0) + (tokenStats.total_output || 0);

  console.log(`\n추적된 토큰: ${totalTokens.toLocaleString()}`);

  // Recent activity
  const lastSession = recentSessions[0];
  if (lastSession) {
    console.log(`\n마지막 세션: ${new Date(lastSession.started_at).toLocaleString()}`);
  }
}
