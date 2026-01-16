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
  try {
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

    if (!session_id) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const session = await getSession(session_id);

    if (session && session.status === 'active') {
      await markSessionCompleted(session_id);
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (err) {
    console.error(`[claude-guard] Error: ${err?.message || 'unknown'}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
