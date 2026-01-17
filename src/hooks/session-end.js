#!/usr/bin/env node

/**
 * SessionEnd Hook - Final cleanup (minimal)
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SESSIONS_FILE = join(homedir(), '.claude-guard', 'sessions.json');

let input = '';
const chunks = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  input = chunks.join('');
  main();
});

function main() {
  try {
    if (!input?.trim()) {
      process.stdout.write('{"continue":true}');
      return;
    }

    const event = JSON.parse(input);
    const session_id = event?.session_id;

    if (!session_id) {
      process.stdout.write('{"continue":true}');
      return;
    }

    // Mark session as completed if still active
    if (existsSync(SESSIONS_FILE)) {
      try {
        const sessions = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
        if (sessions[session_id]?.status === 'active') {
          sessions[session_id].status = 'completed';
          sessions[session_id].ended_at = Date.now();
          writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
        }
      } catch {}
    }

    process.stdout.write('{"continue":true}');
  } catch {
    process.stdout.write('{"continue":true}');
  }
}
