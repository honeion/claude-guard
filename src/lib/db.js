import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const DB_PATH = join(GUARD_DIR, 'guard.db');

// Ensure directory exists
if (!existsSync(GUARD_DIR)) {
  mkdirSync(GUARD_DIR, { recursive: true });
}

let db = null;

// Initialize database
async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  db.run(`
    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      status TEXT DEFAULT 'active',
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

    -- Summaries table
    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      turn_start INTEGER NOT NULL,
      turn_end INTEGER NOT NULL,
      summary TEXT NOT NULL,
      files_read TEXT,
      files_modified TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  // Create indexes
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)`);
  } catch (e) {
    // Indexes might already exist
  }

  saveDb();
  return db;
}

// Save database to file
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

// Helper to run query and get all results
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to run query and get one result
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

// Helper to run insert/update
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

export { db, GUARD_DIR, DB_PATH, initDb, saveDb };

// Session functions
export async function getActiveSessions() {
  await initDb();
  return queryAll(`SELECT * FROM sessions WHERE status = 'active' AND ended_at IS NULL`);
}

export async function getSession(sessionId) {
  await initDb();
  return queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId]);
}

export async function createSession(sessionId, projectPath) {
  await initDb();
  run(`INSERT INTO sessions (id, project_path, started_at, status) VALUES (?, ?, ?, 'active')`,
    [sessionId, projectPath, Date.now()]);
}

export async function updateSession(sessionId, updates) {
  await initDb();
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), sessionId];
  run(`UPDATE sessions SET ${fields} WHERE id = ?`, values);
}

export async function markSessionCompleted(sessionId) {
  await initDb();
  run(`UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?`, [Date.now(), sessionId]);
}

export async function markSessionCrashed(sessionId) {
  await initDb();
  run(`UPDATE sessions SET status = 'crashed', ended_at = ? WHERE id = ?`, [Date.now(), sessionId]);
}

// Token functions
export async function addTokenUsage(sessionId, turn, inputTokens, outputTokens, model) {
  await initDb();
  run(`INSERT INTO token_usage (session_id, turn, timestamp, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, turn, Date.now(), inputTokens, outputTokens, model]);
}

export async function getTokenStats(sessionId = null, fromDate = null, toDate = null) {
  await initDb();
  let sql = `
    SELECT
      COUNT(*) as total_turns,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
    FROM token_usage
    WHERE 1=1
  `;
  const params = [];

  if (sessionId) {
    sql += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (fromDate) {
    sql += ' AND timestamp >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    sql += ' AND timestamp <= ?';
    params.push(toDate);
  }

  return queryOne(sql, params) || { total_turns: 0, total_input: 0, total_output: 0, total_tokens: 0 };
}

// Summary functions
export async function addSummary(sessionId, turnStart, turnEnd, summary, filesRead, filesModified, tokensUsed) {
  await initDb();
  run(`INSERT INTO summaries (session_id, turn_start, turn_end, summary, files_read, files_modified, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, turnStart, turnEnd, summary, JSON.stringify(filesRead), JSON.stringify(filesModified), tokensUsed, Date.now()]);
}

export async function getSummaries(sessionId) {
  await initDb();
  return queryAll(`SELECT * FROM summaries WHERE session_id = ? ORDER BY turn_start ASC`, [sessionId]);
}

// Stats helper
export async function getSessionCount() {
  await initDb();
  const result = queryOne('SELECT COUNT(*) as count FROM sessions');
  return result?.count || 0;
}

export async function getRecentSessions(limit = 5) {
  await initDb();
  return queryAll(`SELECT id, project_path, status, started_at, total_turns FROM sessions ORDER BY started_at DESC LIMIT ?`, [limit]);
}
