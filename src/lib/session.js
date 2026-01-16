import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { GUARD_DIR, getSession, createSession, updateSession } from './db.js';

const SESSIONS_DIR = join(GUARD_DIR, 'sessions');

// Ensure sessions directory exists
if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function getSessionDir(sessionId) {
  return join(SESSIONS_DIR, sessionId);
}

export function ensureSessionDir(sessionId) {
  const dir = getSessionDir(sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Initialize or resume a session
export function initSession(sessionId, projectPath) {
  const existing = getSession(sessionId);

  if (!existing) {
    createSession(sessionId, projectPath);
    ensureSessionDir(sessionId);

    // Create initial meta.json
    const metaPath = join(getSessionDir(sessionId), 'meta.json');
    writeFileSync(metaPath, JSON.stringify({
      session_id: sessionId,
      project_path: projectPath,
      started_at: new Date().toISOString(),
      status: 'active'
    }, null, 2));

    // Create empty tokens.json
    const tokensPath = join(getSessionDir(sessionId), 'tokens.json');
    writeFileSync(tokensPath, JSON.stringify({
      total_input: 0,
      total_output: 0,
      turns: []
    }, null, 2));

    return { isNew: true, session: getSession(sessionId) };
  }

  return { isNew: false, session: existing };
}

// Save current turn state (called on every PostToolUse)
export function saveCurrentState(sessionId, state) {
  const dir = ensureSessionDir(sessionId);
  const currentPath = join(dir, 'current.json');

  writeFileSync(currentPath, JSON.stringify({
    ...state,
    updated_at: new Date().toISOString()
  }, null, 2));

  // Update turn count in DB
  updateSession(sessionId, { total_turns: state.turn });
}

// Get current state
export function getCurrentState(sessionId) {
  const currentPath = join(getSessionDir(sessionId), 'current.json');

  if (existsSync(currentPath)) {
    return JSON.parse(readFileSync(currentPath, 'utf8'));
  }

  return null;
}

// Append summary to summaries.jsonl
export function appendSummary(sessionId, summary) {
  const dir = ensureSessionDir(sessionId);
  const summariesPath = join(dir, 'summaries.jsonl');

  appendFileSync(summariesPath, JSON.stringify(summary) + '\n');
}

// Get all summaries for a session
export function getSummariesFromFile(sessionId) {
  const summariesPath = join(getSessionDir(sessionId), 'summaries.jsonl');

  if (!existsSync(summariesPath)) {
    return [];
  }

  const content = readFileSync(summariesPath, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

// Update token usage in session file
export function updateTokenUsage(sessionId, turn, inputTokens, outputTokens) {
  const tokensPath = join(getSessionDir(sessionId), 'tokens.json');

  let tokens = { total_input: 0, total_output: 0, turns: [] };

  if (existsSync(tokensPath)) {
    tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
  }

  tokens.total_input += inputTokens;
  tokens.total_output += outputTokens;
  tokens.turns.push({
    turn,
    input: inputTokens,
    output: outputTokens,
    timestamp: Date.now()
  });

  writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));

  return tokens;
}

// Get token usage from session file
export function getTokenUsage(sessionId) {
  const tokensPath = join(getSessionDir(sessionId), 'tokens.json');

  if (!existsSync(tokensPath)) {
    return { total_input: 0, total_output: 0, turns: [] };
  }

  return JSON.parse(readFileSync(tokensPath, 'utf8'));
}

// Check for crashed sessions (active but no recent update)
export function findCrashedSessions() {
  const { getActiveSessions } = require('./db.js');
  const activeSessions = getActiveSessions();

  return activeSessions.filter(session => {
    const current = getCurrentState(session.id);
    if (!current) return true; // No current state = definitely crashed

    // Consider crashed if last update > 5 minutes ago and still active
    const lastUpdate = new Date(current.updated_at).getTime();
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

    return lastUpdate < fiveMinutesAgo;
  });
}

// Build recovery context for a crashed session
export function buildRecoveryContext(sessionId) {
  const session = getSession(sessionId);
  const summaries = getSummariesFromFile(sessionId);
  const current = getCurrentState(sessionId);
  const tokens = getTokenUsage(sessionId);

  if (!session) return null;

  let context = `[Session Recovery - Abnormal Termination Detected]\n\n`;

  // Add summary history
  if (summaries.length > 0) {
    context += `## Work History:\n`;
    summaries.forEach(s => {
      context += `- Turn ${s.turns}: ${s.summary}\n`;
    });
    context += `\n`;
  }

  // Add last state
  if (current) {
    context += `## Last State (Turn ${current.turn}):\n`;
    context += `- Request: ${current.last_user_message || 'N/A'}\n`;
    context += `- Last Tool: ${current.last_tool || 'N/A'}\n`;
    context += `- Status: Interrupted\n\n`;
  }

  // Add token stats
  context += `## Token Usage: ${tokens.total_input + tokens.total_output} (input: ${tokens.total_input} / output: ${tokens.total_output})\n\n`;
  context += `Continue from where you left off based on the context above.`;

  return context;
}
