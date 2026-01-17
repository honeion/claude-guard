#!/usr/bin/env node

/**
 * SessionStart Hook - LIGHTWEIGHT VERSION
 * Check for crashed sessions, initialize new session
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_DIR = join(GUARD_DIR, 'sessions');
const SESSIONS_FILE = join(GUARD_DIR, 'sessions.json');

// Ensure directories exist
if (!existsSync(GUARD_DIR)) {
  try { mkdirSync(GUARD_DIR, { recursive: true }); } catch {}
}
if (!existsSync(SESSIONS_DIR)) {
  try { mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return fallback; }
}

function writeJson(path, data) {
  try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch {}
}

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
    const cwd = event?.cwd || '';

    if (!session_id) {
      process.stdout.write('{"continue":true}');
      return;
    }

    // Load sessions
    const sessions = readJson(SESSIONS_FILE, {});

    // Check for crashed sessions (active with old current.json)
    let crashedSession = null;
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    for (const [id, s] of Object.entries(sessions)) {
      if (id === session_id) continue;
      if (s.status !== 'active') continue;

      const currentPath = join(SESSIONS_DIR, id, 'current.json');
      const current = readJson(currentPath, null);

      if (current?.ts && current.ts < tenMinutesAgo) {
        // Mark as crashed
        sessions[id].status = 'crashed';
        sessions[id].ended_at = Date.now();
        crashedSession = { id, ...s, current };
      }
    }

    // Create/update current session
    if (!sessions[session_id]) {
      sessions[session_id] = {
        id: session_id,
        project_path: cwd,
        started_at: Date.now(),
        status: 'active'
      };
    } else {
      sessions[session_id].status = 'active';
    }

    // Ensure session directory
    const sessionDir = join(SESSIONS_DIR, session_id);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    writeJson(SESSIONS_FILE, sessions);

    // Output with optional recovery context
    const output = { continue: true };

    if (crashedSession) {
      // Build minimal recovery context
      const summariesPath = join(SESSIONS_DIR, crashedSession.id, 'summaries.jsonl');
      let summaries = [];
      try {
        if (existsSync(summariesPath)) {
          summaries = readFileSync(summariesPath, 'utf8')
            .split('\n')
            .filter(l => l.trim())
            .slice(-3) // Last 3 summaries only
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
        }
      } catch {}

      let context = `[세션 복구]\n`;
      if (summaries.length > 0) {
        context += summaries.map(s => `- ${s.summary || ''}`).join('\n');
      }
      context += `\n마지막: ${crashedSession.current?.tool || 'N/A'}`;

      output.hookSpecificOutput = {
        hookEventName: 'SessionStart',
        additionalContext: context
      };
    }

    process.stdout.write(JSON.stringify(output));
  } catch {
    process.stdout.write('{"continue":true}');
  }
}
