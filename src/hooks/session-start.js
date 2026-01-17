#!/usr/bin/env node

/**
 * SessionStart Hook
 * - Check for crashed sessions (conservatively)
 * - Inject recovery context if needed
 * - Initialize new session
 */

import { getActiveSessions, markSessionCrashed } from '../lib/db.js';
import { initSession, getCurrentState, buildRecoveryContext, updateMetaStatus } from '../lib/session.js';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

async function main() {
  try {
    // Read input from stdin
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    if (!input || !input.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    let event;
    try {
      event = JSON.parse(input);
    } catch {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    if (!event || typeof event !== 'object') {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const session_id = event.session_id;
    const cwd = event.cwd || '';

    if (!session_id) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Initialize current session FIRST
    await initSession(session_id, cwd);

    // Check for crashed sessions (conservative approach)
    let activeSessions = [];
    try {
      activeSessions = await getActiveSessions();
    } catch {
      activeSessions = [];
    }

    const crashedSessions = [];

    for (const s of activeSessions) {
      if (!s || !s.id) continue;
      if (s.id === session_id) continue;

      try {
        const current = getCurrentState(s.id);

        // Only mark as crashed if:
        // 1. Has current.json (was actually used)
        // 2. Last update was > 10 minutes ago
        if (current && current.updated_at) {
          const lastUpdate = new Date(current.updated_at).getTime();
          if (!isNaN(lastUpdate)) {
            const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
            if (lastUpdate < tenMinutesAgo) {
              crashedSessions.push(s);
              await markSessionCrashed(s.id);
              updateMetaStatus(s.id, 'crashed');
            }
          }
        }
      } catch {
        // Ignore errors for individual sessions
      }
    }

    // Build output
    const output = { continue: true };

    // If there was a recent crash, inject recovery context
    if (crashedSessions.length > 0) {
      try {
        const lastCrashed = crashedSessions[crashedSessions.length - 1];
        const recoveryContext = await buildRecoveryContext(lastCrashed.id);

        if (recoveryContext) {
          output.hookSpecificOutput = {
            hookEventName: 'SessionStart',
            additionalContext: recoveryContext
          };
          console.error(`\n[claude-guard] 이전 세션 복구: ${lastCrashed.id.slice(0, 8)}...\n`);
        }
      } catch {
        // Ignore recovery errors
      }
    }

    console.log(JSON.stringify(output));
  } catch (err) {
    console.error(`[claude-guard] Error: ${err?.message || 'unknown'}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
