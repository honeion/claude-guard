/**
 * Show claude-guard status
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { db, GUARD_DIR } from '../lib/db.js';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export async function status() {
  console.log('\n=== claude-guard Status ===\n');

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

  console.log(`Hooks: ${hooksEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Data Directory: ${GUARD_DIR}`);

  // Session stats
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
  const activeSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('active').count;
  const crashedSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('crashed').count;

  console.log(`\nSessions:`);
  console.log(`  Total: ${totalSessions}`);
  console.log(`  Active: ${activeSessions}`);
  console.log(`  Crashed: ${crashedSessions}`);

  // Token stats
  const tokenStats = db.prepare(`
    SELECT
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output
    FROM token_usage
  `).get();

  const totalTokens = (tokenStats.total_input || 0) + (tokenStats.total_output || 0);

  console.log(`\nTokens Tracked: ${totalTokens.toLocaleString()}`);

  // Recent activity
  const lastSession = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1').get();
  if (lastSession) {
    console.log(`\nLast Session: ${new Date(lastSession.started_at).toLocaleString()}`);
  }
}
