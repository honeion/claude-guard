#!/usr/bin/env node

/**
 * SessionStart Hook
 * - Check for crashed sessions
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
  const { session_id, cwd, source } = event;

  // Check for crashed sessions (not this one)
  const activeSessions = getActiveSessions();
  const crashedSessions = activeSessions.filter(s => {
    if (s.id === session_id) return false;

    const current = getCurrentState(s.id);
    if (!current) return true;

    // Crashed if last update > 5 minutes ago
    const lastUpdate = new Date(current.updated_at).getTime();
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

    return lastUpdate < fiveMinutesAgo;
  });

  // Mark crashed sessions
  for (const crashed of crashedSessions) {
    markSessionCrashed(crashed.id);
  }

  // Initialize current session
  const { isNew, session } = initSession(session_id, cwd);

  // Build output
  const output = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart'
    }
  };

  // If there was a crash, inject recovery context
  if (crashedSessions.length > 0) {
    const lastCrashed = crashedSessions[crashedSessions.length - 1];
    const recoveryContext = buildRecoveryContext(lastCrashed.id);

    if (recoveryContext) {
      output.hookSpecificOutput.additionalContext = recoveryContext;

      // Also output to stderr for user visibility
      console.error(`\n[claude-guard] Recovered from crashed session: ${lastCrashed.id.slice(0, 8)}...\n`);
    }
  }

  // Output result
  console.log(JSON.stringify(output));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  process.exit(2);
});
