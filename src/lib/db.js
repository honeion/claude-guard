/**
 * File-based storage (no sql.js, no WASM)
 * All data stored as JSON files for minimal overhead
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_FILE = join(GUARD_DIR, 'sessions.json');
const TOKENS_FILE = join(GUARD_DIR, 'tokens.json');

// Ensure directory exists (sync, runs once)
if (!existsSync(GUARD_DIR)) {
  try { mkdirSync(GUARD_DIR, { recursive: true }); } catch {}
}

// ============ Helper functions ============

function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ============ Sessions ============

function getSessions() {
  return readJson(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
  return writeJson(SESSIONS_FILE, sessions);
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const sessions = getSessions();
  return sessions[sessionId] || null;
}

export function createSession(sessionId, projectPath) {
  if (!sessionId) return false;
  const sessions = getSessions();
  sessions[sessionId] = {
    id: sessionId,
    project_path: projectPath || '',
    started_at: Date.now(),
    status: 'active',
    total_turns: 0,
    last_summary_turn: 0
  };
  return saveSessions(sessions);
}

export function updateSession(sessionId, updates) {
  if (!sessionId || !updates) return false;
  const sessions = getSessions();
  if (!sessions[sessionId]) return false;
  Object.assign(sessions[sessionId], updates);
  return saveSessions(sessions);
}

export function getActiveSessions() {
  const sessions = getSessions();
  return Object.values(sessions).filter(s => s.status === 'active');
}

export function markSessionCompleted(sessionId) {
  return updateSession(sessionId, { status: 'completed', ended_at: Date.now() });
}

export function markSessionCrashed(sessionId) {
  return updateSession(sessionId, { status: 'crashed', ended_at: Date.now() });
}

// ============ Tokens ============

function getTokensData() {
  return readJson(TOKENS_FILE, { sessions: {}, daily: {} });
}

function saveTokensData(data) {
  return writeJson(TOKENS_FILE, data);
}

export function addTokenUsage(sessionId, turn, inputTokens, outputTokens, model) {
  if (!sessionId) return false;
  const data = getTokensData();

  if (!data.sessions[sessionId]) {
    data.sessions[sessionId] = { input: 0, output: 0, turns: 0 };
  }

  data.sessions[sessionId].input = inputTokens || 0; // Last context size
  data.sessions[sessionId].output += outputTokens || 0;
  data.sessions[sessionId].turns = turn || 0;
  data.sessions[sessionId].model = model;
  data.sessions[sessionId].updated_at = Date.now();

  // Daily aggregation
  const today = new Date().toISOString().split('T')[0];
  if (!data.daily[today]) {
    data.daily[today] = { input: 0, output: 0, sessions: 0 };
  }

  return saveTokensData(data);
}

export function finalizeSessionTokens(sessionId, inputTokens, outputTokens) {
  if (!sessionId) return false;
  const data = getTokensData();

  if (!data.sessions[sessionId]) {
    data.sessions[sessionId] = { input: 0, output: 0, turns: 0 };
  }

  data.sessions[sessionId].input = inputTokens || 0;
  data.sessions[sessionId].output = outputTokens || 0;
  data.sessions[sessionId].finalized = true;
  data.sessions[sessionId].updated_at = Date.now();

  // Add to daily
  const today = new Date().toISOString().split('T')[0];
  if (!data.daily[today]) {
    data.daily[today] = { input: 0, output: 0, sessions: 0 };
  }
  data.daily[today].input += inputTokens || 0;
  data.daily[today].output += outputTokens || 0;
  data.daily[today].sessions += 1;

  return saveTokensData(data);
}

export function getTokenStats(sessionId = null, fromDate = null, toDate = null) {
  const data = getTokensData();

  if (sessionId) {
    const s = data.sessions[sessionId];
    return s ? {
      total_turns: s.turns || 0,
      total_input: s.input || 0,
      total_output: s.output || 0,
      total_tokens: (s.input || 0) + (s.output || 0)
    } : { total_turns: 0, total_input: 0, total_output: 0, total_tokens: 0 };
  }

  // Aggregate from daily data
  let totalInput = 0, totalOutput = 0, totalSessions = 0;

  for (const [date, stats] of Object.entries(data.daily)) {
    const d = new Date(date).getTime();
    if (fromDate && d < fromDate) continue;
    if (toDate && d > toDate) continue;
    totalInput += stats.input || 0;
    totalOutput += stats.output || 0;
    totalSessions += stats.sessions || 0;
  }

  return {
    total_turns: totalSessions,
    total_input: totalInput,
    total_output: totalOutput,
    total_tokens: totalInput + totalOutput
  };
}

export function getSessionCount() {
  const sessions = getSessions();
  return Object.keys(sessions).length;
}

export function getRecentSessions(limit = 5) {
  const sessions = getSessions();
  return Object.values(sessions)
    .sort((a, b) => (b.started_at || 0) - (a.started_at || 0))
    .slice(0, limit);
}

export function getRecentSessionsWithStats(limit = 5) {
  const sessions = getRecentSessions(limit);
  const tokensData = getTokensData();

  return sessions.map(s => {
    const t = tokensData.sessions[s.id] || {};
    return {
      ...s,
      total_input: t.input || 0,
      total_output: t.output || 0
    };
  });
}

export function getSessionTokenStats(sessionId) {
  const data = getTokensData();
  const s = data.sessions[sessionId];
  return s ? { total_input: s.input || 0, total_output: s.output || 0 }
           : { total_input: 0, total_output: 0 };
}

export function getDailyStats(days = 7) {
  const data = getTokensData();
  const results = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < days; i++) {
    const date = new Date(now - i * dayMs).toISOString().split('T')[0];
    const stats = data.daily[date] || { input: 0, output: 0, sessions: 0 };
    results.push({
      date,
      total_input: stats.input,
      total_output: stats.output,
      sessions: stats.sessions
    });
  }

  return results.reverse();
}

// ============ Summaries (stored per-session in files) ============

export function addSummary(sessionId, turnStart, turnEnd, summary, filesRead, filesModified, tokensUsed) {
  // Summaries are stored in session files, not here
  // This is just for compatibility - actual storage in session.js
  return true;
}

export function getSummaries(sessionId) {
  // Read from session file
  const sessionDir = join(GUARD_DIR, 'sessions', sessionId);
  const summariesPath = join(sessionDir, 'summaries.jsonl');

  try {
    if (!existsSync(summariesPath)) return [];
    const content = readFileSync(summariesPath, 'utf8');
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Backward compatibility - these do nothing now
export async function initDb() { return true; }
export function saveDb() { return true; }
