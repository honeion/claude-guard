#!/usr/bin/env node

/**
 * SessionEnd Hook
 * - Final cleanup
 * - Ensure session is marked properly
 */

import { getSession, markSessionCompleted } from '../lib/db.js';

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
  const { session_id, reason } = event;

  const session = getSession(session_id);

  if (session && session.status === 'active') {
    // Mark as completed if still active
    markSessionCompleted(session_id);
  }

  // Output success
  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  console.log(JSON.stringify({ continue: true }));
});
