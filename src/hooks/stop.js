#!/usr/bin/env node

/**
 * Stop Hook - Token tracking and session finalization
 * This is where heavy operations happen (once per response, not per tool)
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_DIR = join(GUARD_DIR, 'sessions');
const SESSIONS_FILE = join(GUARD_DIR, 'sessions.json');
const TOKENS_FILE = join(GUARD_DIR, 'tokens.json');

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return fallback; }
}

function writeJson(path, data) {
  try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch {}
}

function extractTokens(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return { input: 0, output: 0, model: 'unknown' };
  }

  try {
    const content = readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');
    const seenIds = new Set();
    let lastInput = 0, totalOutput = 0, model = 'unknown';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry?.type === 'assistant' && entry?.message?.usage && entry?.message?.id) {
          if (seenIds.has(entry.message.id)) continue;
          seenIds.add(entry.message.id);

          const u = entry.message.usage;
          lastInput = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          totalOutput += u.output_tokens || 0;
          model = entry.message.model || model;
        }
      } catch {}
    }

    return { input: lastInput, output: totalOutput, model };
  } catch {
    return { input: 0, output: 0, model: 'unknown' };
  }
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
    const transcript_path = event?.transcript_path;

    if (!session_id) {
      process.stdout.write('{"continue":true}');
      return;
    }

    // Extract tokens
    const tokens = extractTokens(transcript_path);

    // Update tokens file
    const tokensData = readJson(TOKENS_FILE, { sessions: {}, daily: {} });
    const today = new Date().toISOString().split('T')[0];

    if (!tokensData.sessions[session_id]) {
      tokensData.sessions[session_id] = { input: 0, output: 0 };
    }
    if (!tokensData.daily[today]) {
      tokensData.daily[today] = { input: 0, output: 0, sessions: 0 };
    }

    // Update session tokens
    const prev = tokensData.sessions[session_id];
    const inputDelta = Math.max(0, tokens.input - (prev.input || 0));
    const outputDelta = tokens.output - (prev.output || 0);

    tokensData.sessions[session_id] = {
      input: tokens.input,
      output: tokens.output,
      model: tokens.model,
      updated_at: Date.now()
    };

    // Add delta to daily (only if positive)
    if (inputDelta > 0) tokensData.daily[today].input += inputDelta;
    if (outputDelta > 0) tokensData.daily[today].output += outputDelta;

    writeJson(TOKENS_FILE, tokensData);

    // Update session status
    const sessions = readJson(SESSIONS_FILE, {});
    if (sessions[session_id]) {
      sessions[session_id].status = 'completed';
      sessions[session_id].ended_at = Date.now();
      writeJson(SESSIONS_FILE, sessions);
    }

    // Append summary
    const sessionDir = join(SESSIONS_DIR, session_id);
    if (existsSync(sessionDir)) {
      const summariesPath = join(sessionDir, 'summaries.jsonl');
      const currentPath = join(sessionDir, 'current.json');
      const current = readJson(currentPath, {});

      const summary = {
        ts: Date.now(),
        summary: current.tool ? `${current.tool}` : 'session end',
        tokens: { input: tokens.input, output: tokens.output }
      };

      try {
        appendFileSync(summariesPath, JSON.stringify(summary) + '\n');
      } catch {}
    }

    process.stdout.write('{"continue":true}');
  } catch {
    process.stdout.write('{"continue":true}');
  }
}
