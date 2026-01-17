import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { GUARD_DIR, getSession, createSession, updateSession } from './db.js';

const SESSIONS_DIR = join(GUARD_DIR, 'sessions');

// Ensure sessions directory exists
try {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
} catch (e) {
  // Ignore - will fail later if really broken
}

export function getSessionDir(sessionId) {
  return join(SESSIONS_DIR, sessionId);
}

export function ensureSessionDir(sessionId) {
  const dir = getSessionDir(sessionId);
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    // Ignore
  }
  return dir;
}

// Safe JSON parse with fallback
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// Safe file read with fallback
function safeReadJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    const content = readFileSync(path, 'utf8');
    if (!content || !content.trim()) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

// Safe file write
function safeWriteJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

// Initialize or resume a session
export async function initSession(sessionId, projectPath) {
  try {
    const existing = await getSession(sessionId);

    if (!existing) {
      await createSession(sessionId, projectPath);
      ensureSessionDir(sessionId);

      const metaPath = join(getSessionDir(sessionId), 'meta.json');
      safeWriteJson(metaPath, {
        session_id: sessionId,
        project_path: projectPath,
        started_at: new Date().toISOString(),
        status: 'active'
      });

      const tokensPath = join(getSessionDir(sessionId), 'tokens.json');
      safeWriteJson(tokensPath, {
        total_input: 0,
        total_output: 0,
        turns: []
      });

      return { isNew: true, session: await getSession(sessionId) };
    }

    // Resume existing session
    const sessionDir = ensureSessionDir(sessionId);

    if (existing.status !== 'active') {
      await updateSession(sessionId, { status: 'active', ended_at: null });

      const metaPath = join(sessionDir, 'meta.json');
      const meta = safeReadJson(metaPath, null);

      if (meta) {
        meta.status = 'active';
        meta.resumed_at = new Date().toISOString();
        safeWriteJson(metaPath, meta);
      } else {
        safeWriteJson(metaPath, {
          session_id: sessionId,
          project_path: projectPath,
          started_at: existing.started_at ? new Date(existing.started_at).toISOString() : new Date().toISOString(),
          resumed_at: new Date().toISOString(),
          status: 'active'
        });
      }
    }

    // Ensure tokens.json exists
    const tokensPath = join(sessionDir, 'tokens.json');
    if (!existsSync(tokensPath)) {
      safeWriteJson(tokensPath, {
        total_input: 0,
        total_output: 0,
        turns: []
      });
    }

    return { isNew: false, session: await getSession(sessionId) };
  } catch (e) {
    // Return minimal valid response on error
    return { isNew: true, session: null };
  }
}

// Save current turn state
export async function saveCurrentState(sessionId, state) {
  try {
    const dir = ensureSessionDir(sessionId);
    const currentPath = join(dir, 'current.json');

    safeWriteJson(currentPath, {
      ...state,
      updated_at: new Date().toISOString()
    });

    await updateSession(sessionId, { total_turns: state.turn || 0 });
  } catch {
    // Ignore errors - non-critical
  }
}

// Get current state
export function getCurrentState(sessionId) {
  const currentPath = join(getSessionDir(sessionId), 'current.json');
  return safeReadJson(currentPath, null);
}

// Append summary to summaries.jsonl
export function appendSummary(sessionId, summary) {
  try {
    const dir = ensureSessionDir(sessionId);
    const summariesPath = join(dir, 'summaries.jsonl');
    appendFileSync(summariesPath, JSON.stringify(summary) + '\n');
  } catch {
    // Ignore
  }
}

// Get all summaries for a session
export function getSummariesFromFile(sessionId) {
  try {
    const summariesPath = join(getSessionDir(sessionId), 'summaries.jsonl');
    if (!existsSync(summariesPath)) return [];

    const content = readFileSync(summariesPath, 'utf8');
    if (!content || !content.trim()) return [];

    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => safeJsonParse(line, null))
      .filter(item => item !== null);
  } catch {
    return [];
  }
}

// Update token usage in session file
export function updateTokenUsage(sessionId, turn, inputTokens, outputTokens) {
  try {
    const tokensPath = join(getSessionDir(sessionId), 'tokens.json');
    let tokens = safeReadJson(tokensPath, { total_input: 0, total_output: 0, turns: [] });

    // Ensure valid structure
    if (!tokens || typeof tokens !== 'object') {
      tokens = { total_input: 0, total_output: 0, turns: [] };
    }
    if (!Array.isArray(tokens.turns)) tokens.turns = [];
    if (typeof tokens.total_input !== 'number') tokens.total_input = 0;
    if (typeof tokens.total_output !== 'number') tokens.total_output = 0;

    tokens.total_input += inputTokens || 0;
    tokens.total_output += outputTokens || 0;
    tokens.turns.push({
      turn: turn || 0,
      input: inputTokens || 0,
      output: outputTokens || 0,
      timestamp: Date.now()
    });

    safeWriteJson(tokensPath, tokens);
    return tokens;
  } catch {
    return { total_input: 0, total_output: 0, turns: [] };
  }
}

// Get token usage from session file
export function getTokenUsage(sessionId) {
  const tokensPath = join(getSessionDir(sessionId), 'tokens.json');
  const tokens = safeReadJson(tokensPath, { total_input: 0, total_output: 0, turns: [] });

  // Ensure valid structure
  if (!tokens || typeof tokens !== 'object') {
    return { total_input: 0, total_output: 0, turns: [] };
  }
  if (!Array.isArray(tokens.turns)) tokens.turns = [];
  if (typeof tokens.total_input !== 'number') tokens.total_input = 0;
  if (typeof tokens.total_output !== 'number') tokens.total_output = 0;

  return tokens;
}

// Update meta.json status (sync DB and JSON)
export function updateMetaStatus(sessionId, status, additionalFields = {}) {
  try {
    const metaPath = join(getSessionDir(sessionId), 'meta.json');
    let meta = safeReadJson(metaPath, null);

    if (meta) {
      meta.status = status;
      meta.ended_at = additionalFields.ended_at || new Date().toISOString();
      Object.assign(meta, additionalFields);
      safeWriteJson(metaPath, meta);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Build recovery context for a crashed session
export async function buildRecoveryContext(sessionId) {
  try {
    const session = await getSession(sessionId);
    if (!session) return null;

    const summaries = getSummariesFromFile(sessionId);
    const current = getCurrentState(sessionId);
    const tokens = getTokenUsage(sessionId);

    let context = `[세션 복구 - 비정상 종료 감지됨]\n\n`;

    if (summaries.length > 0) {
      context += `## 작업 히스토리:\n`;
      summaries.forEach(s => {
        if (s && s.turns && s.summary) {
          context += `- Turn ${s.turns}: ${s.summary}\n`;
        }
      });
      context += `\n`;
    }

    if (current) {
      context += `## 마지막 상태 (Turn ${current.turn || '?'}):\n`;
      context += `- 마지막 도구: ${current.last_tool || 'N/A'}\n`;
      context += `- 상태: 중단됨\n\n`;
    }

    context += `## 토큰 사용량: ${tokens.total_input + tokens.total_output} (input: ${tokens.total_input} / output: ${tokens.total_output})\n\n`;
    context += `위 컨텍스트를 바탕으로 작업을 이어가세요.`;

    return context;
  } catch {
    return null;
  }
}
