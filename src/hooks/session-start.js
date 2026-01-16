#!/usr/bin/env node

/**
 * SessionStart Hook
 * - Check for crashed sessions (conservatively)
 * - Inject recovery context if needed
 * - Initialize new session
 */

import { getActiveSessions, markSessionCrashed } from '../lib/db.js';
import { initSession, getCurrentState, buildRecoveryContext } from '../lib/session.js';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

async function main() {
  // Read input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const event = JSON.parse(input);
  const { session_id, cwd } = event;

  // Initialize current session FIRST
  const { isNew, session } = await initSession(session_id, cwd);

  // Check for crashed sessions (conservative approach)
  const activeSessions = await getActiveSessions();
  const crashedSessions = [];

  for (const s of activeSessions) {
    // Skip current session
    if (s.id === session_id) continue;

    const current = getCurrentState(s.id);

    // Only mark as crashed if:
    // 1. Has current.json (was actually used)
    // 2. Last update was > 10 minutes ago
    if (current && current.updated_at) {
      const lastUpdate = new Date(current.updated_at).getTime();
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

      if (lastUpdate < tenMinutesAgo) {
        crashedSessions.push(s);
        await markSessionCrashed(s.id);
      }
    }
    // Sessions without current.json are likely just initialized, skip them
  }

  // Build output
  const output = {
    continue: true
  };

  // If there was a recent crash, inject recovery context
  if (crashedSessions.length > 0) {
    const lastCrashed = crashedSessions[crashedSessions.length - 1];
    const recoveryContext = await buildRecoveryContext(lastCrashed.id);

    if (recoveryContext) {
      output.hookSpecificOutput = {
        hookEventName: 'SessionStart',
        additionalContext: recoveryContext
      };
      console.error(`\n[claude-guard] 이전 세션 복구: ${lastCrashed.id.slice(0, 8)}...\n`);
    }
  }

  console.log(JSON.stringify(output));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  // Don't exit with error, just continue
  console.log(JSON.stringify({ continue: true }));
});
