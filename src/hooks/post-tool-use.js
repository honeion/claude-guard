#!/usr/bin/env node

/**
 * PostToolUse Hook - LIGHTWEIGHT VERSION
 * Only writes current.json, nothing else
 * All heavy operations moved to Stop hook
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_DIR = join(GUARD_DIR, 'sessions');

// Read stdin synchronously for speed
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

    // Ensure session directory exists
    const sessionDir = join(SESSIONS_DIR, session_id);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Write current.json only - minimal data
    const currentPath = join(sessionDir, 'current.json');
    writeFileSync(currentPath, JSON.stringify({
      tool: event.tool_name || '',
      id: event.tool_use_id || '',
      ts: Date.now()
    }));

    process.stdout.write('{"continue":true}');
  } catch {
    process.stdout.write('{"continue":true}');
  }
}
