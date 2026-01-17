import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const DB_PATH = join(GUARD_DIR, 'guard.db');

// Ensure directory exists
try {
  if (!existsSync(GUARD_DIR)) {
    mkdirSync(GUARD_DIR, { recursive: true });
  }
} catch (e) {
  // Will fail later if really broken
}

let db = null;
let dbInitialized = false;

// Initialize database
async function initDb() {
  if (db && dbInitialized) return db;

  try {
    const SQL = await initSqlJs();

    // Load existing database or create new
    if (existsSync(DB_PATH)) {
      try {
        const buffer = readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
      } catch (e) {
        // DB file corrupted, create new
        console.error('[claude-guard] DB corrupted, creating new');
        try { unlinkSync(DB_PATH); } catch {}
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    // Initialize schema
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          project_path TEXT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          status TEXT DEFAULT 'active',
          total_turns INTEGER DEFAULT 0,
          last_summary_turn INTEGER DEFAULT 0
        );

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

      // Create indexes (ignore errors if exist)
      try { db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`); } catch {}
      try { db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id)`); } catch {}
      try { db.run(`CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)`); } catch {}
    } catch (e) {
      // Schema already exists or other error
    }

    saveDb();
    dbInitialized = true;
    return db;
  } catch (e) {
    console.error('[claude-guard] DB init failed:', e.message);
    return null;
  }
}

// Save database to file
function saveDb() {
  if (!db) return false;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
    return true;
  } catch (e) {
    return false;
  }
}

// Safe query execution
function queryAll(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    return [];
  }
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function run(sql, params = []) {
  if (!db) return false;
  try {
    db.run(sql, params);
    saveDb();
    return true;
  } catch (e) {
    return false;
  }
}

export { db, GUARD_DIR, DB_PATH, initDb, saveDb };

// Session functions
export async function getActiveSessions() {
  await initDb();
  return queryAll(`SELECT * FROM sessions WHERE status = 'active' AND ended_at IS NULL`);
}

export async function getSession(sessionId) {
  if (!sessionId) return null;
  await initDb();
  return queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId]);
}

export async function createSession(sessionId, projectPath) {
  if (!sessionId) return false;
  await initDb();
  return run(`INSERT OR REPLACE INTO sessions (id, project_path, started_at, status) VALUES (?, ?, ?, 'active')`,
    [sessionId, projectPath || '', Date.now()]);
}

export async function updateSession(sessionId, updates) {
  if (!sessionId || !updates || typeof updates !== 'object') return false;
  await initDb();

  const keys = Object.keys(updates).filter(k => k && updates[k] !== undefined);
  if (keys.length === 0) return false;

  const fields = keys.map(k => `${k} = ?`).join(', ');
  const values = [...keys.map(k => updates[k]), sessionId];
  return run(`UPDATE sessions SET ${fields} WHERE id = ?`, values);
}

export async function markSessionCompleted(sessionId) {
  if (!sessionId) return false;
  await initDb();
  return run(`UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?`, [Date.now(), sessionId]);
}

export async function markSessionCrashed(sessionId) {
  if (!sessionId) return false;
  await initDb();
  return run(`UPDATE sessions SET status = 'crashed', ended_at = ? WHERE id = ?`, [Date.now(), sessionId]);
}

// Token functions
export async function addTokenUsage(sessionId, turn, inputTokens, outputTokens, model) {
  if (!sessionId) return false;
  await initDb();
  return run(`INSERT INTO token_usage (session_id, turn, timestamp, input_tokens, output_tokens, model) VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, turn || 0, Date.now(), inputTokens || 0, outputTokens || 0, model || 'unknown']);
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
  if (!sessionId) return false;
  await initDb();

  let filesReadStr = '[]';
  let filesModifiedStr = '[]';

  try { filesReadStr = JSON.stringify(filesRead || []); } catch {}
  try { filesModifiedStr = JSON.stringify(filesModified || []); } catch {}

  return run(`INSERT INTO summaries (session_id, turn_start, turn_end, summary, files_read, files_modified, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, turnStart || 0, turnEnd || 0, summary || '', filesReadStr, filesModifiedStr, tokensUsed || 0, Date.now()]);
}

export async function getSummaries(sessionId) {
  if (!sessionId) return [];
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
  return queryAll(`SELECT id, project_path, status, started_at, total_turns FROM sessions ORDER BY started_at DESC LIMIT ?`, [limit || 5]);
}

// Get recent sessions with token stats and first summary
export async function getRecentSessionsWithStats(limit = 5) {
  await initDb();
  return queryAll(`
    SELECT
      s.id,
      s.project_path,
      s.status,
      s.started_at,
      s.total_turns,
      COALESCE(SUM(t.input_tokens), 0) as total_input,
      COALESCE(SUM(t.output_tokens), 0) as total_output,
      (SELECT summary FROM summaries WHERE session_id = s.id ORDER BY turn_start ASC LIMIT 1) as first_summary
    FROM sessions s
    LEFT JOIN token_usage t ON s.id = t.session_id
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `, [limit || 5]);
}

// Get token stats for a specific session from DB
export async function getSessionTokenStats(sessionId) {
  if (!sessionId) return { total_input: 0, total_output: 0 };
  await initDb();
  return queryOne(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output
    FROM token_usage
    WHERE session_id = ?
  `, [sessionId]) || { total_input: 0, total_output: 0 };
}
