import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const DB_PATH = join(GUARD_DIR, 'guard.db');

// Ensure directory exists
if (!existsSync(GUARD_DIR)) {
  mkdirSync(GUARD_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  -- Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT DEFAULT 'active',  -- active, completed, crashed
    total_turns INTEGER DEFAULT 0,
    last_summary_turn INTEGER DEFAULT 0
  );

  -- Token usage table
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    model TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Summaries table (for quick lookup)
  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_start INTEGER NOT NULL,
    turn_end INTEGER NOT NULL,
    summary TEXT NOT NULL,
    files_read TEXT,      -- JSON array
    files_modified TEXT,  -- JSON array
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
  CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);
`);

export { db, GUARD_DIR, DB_PATH };

// Helper functions
export function getActiveSessions() {
  return db.prepare(`
    SELECT * FROM sessions
    WHERE status = 'active'
    AND ended_at IS NULL
  `).all();
}

export function getSession(sessionId) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

export function createSession(sessionId, projectPath) {
  return db.prepare(`
    INSERT INTO sessions (id, project_path, started_at, status)
    VALUES (?, ?, ?, 'active')
  `).run(sessionId, projectPath, Date.now());
}

export function updateSession(sessionId, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  return db.prepare(`UPDATE sessions SET ${fields} WHERE id = ?`).run(...values, sessionId);
}

export function markSessionCompleted(sessionId) {
  return db.prepare(`
    UPDATE sessions
    SET status = 'completed', ended_at = ?
    WHERE id = ?
  `).run(Date.now(), sessionId);
}

export function markSessionCrashed(sessionId) {
  return db.prepare(`
    UPDATE sessions
    SET status = 'crashed', ended_at = ?
    WHERE id = ?
  `).run(Date.now(), sessionId);
}

export function addTokenUsage(sessionId, turn, inputTokens, outputTokens, model) {
  return db.prepare(`
    INSERT INTO token_usage (session_id, turn, timestamp, input_tokens, output_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, turn, Date.now(), inputTokens, outputTokens, model);
}

export function getTokenStats(sessionId = null, fromDate = null, toDate = null) {
  let query = `
    SELECT
      COUNT(*) as total_turns,
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output,
      SUM(input_tokens + output_tokens) as total_tokens
    FROM token_usage
    WHERE 1=1
  `;
  const params = [];

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (fromDate) {
    query += ' AND timestamp >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    query += ' AND timestamp <= ?';
    params.push(toDate);
  }

  return db.prepare(query).get(...params);
}

export function addSummary(sessionId, turnStart, turnEnd, summary, filesRead, filesModified, tokensUsed) {
  return db.prepare(`
    INSERT INTO summaries (session_id, turn_start, turn_end, summary, files_read, files_modified, tokens_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, turnStart, turnEnd, summary, JSON.stringify(filesRead), JSON.stringify(filesModified), tokensUsed, Date.now());
}

export function getSummaries(sessionId) {
  return db.prepare(`
    SELECT * FROM summaries
    WHERE session_id = ?
    ORDER BY turn_start ASC
  `).all(sessionId);
}
