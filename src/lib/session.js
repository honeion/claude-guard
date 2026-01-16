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
export async function initSession(sessionId, projectPath) {
  const existing = await getSession(sessionId);

  if (!existing) {
    await createSession(sessionId, projectPath);
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

    return { isNew: true, session: await getSession(sessionId) };
  }

  return { isNew: false, session: existing };
}

// Save current turn state (called on every PostToolUse)
export async function saveCurrentState(sessionId, state) {
  const dir = ensureSessionDir(sessionId);
  const currentPath = join(dir, 'current.json');

  writeFileSync(currentPath, JSON.stringify({
    ...state,
    updated_at: new Date().toISOString()
  }, null, 2));

  // Update turn count in DB
  await updateSession(sessionId, { total_turns: state.turn });
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

// Build recovery context for a crashed session
export async function buildRecoveryContext(sessionId) {
  const session = await getSession(sessionId);
  const summaries = getSummariesFromFile(sessionId);
  const current = getCurrentState(sessionId);
  const tokens = getTokenUsage(sessionId);

  if (!session) return null;

  let context = `[세션 복구 - 비정상 종료 감지됨]\n\n`;

  // Add summary history
  if (summaries.length > 0) {
    context += `## 작업 히스토리:\n`;
    summaries.forEach(s => {
      context += `- Turn ${s.turns}: ${s.summary}\n`;
    });
    context += `\n`;
  }

  // Add last state
  if (current) {
    context += `## 마지막 상태 (Turn ${current.turn}):\n`;
    context += `- 요청: ${current.last_user_message || 'N/A'}\n`;
    context += `- 마지막 도구: ${current.last_tool || 'N/A'}\n`;
    context += `- 상태: 중단됨\n\n`;
  }

  // Add token stats
  context += `## 토큰 사용량: ${tokens.total_input + tokens.total_output} (input: ${tokens.total_input} / output: ${tokens.total_output})\n\n`;
  context += `위 컨텍스트를 바탕으로 작업을 이어가세요.`;

  return context;
}
