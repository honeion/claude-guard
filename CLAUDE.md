# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

claude-guard is a session protection and token tracking tool for Claude Code. It uses Claude Code's hook system to:
- Recover from crashes by detecting abnormally terminated sessions
- Track token usage with cost estimates
- Generate incremental summaries every 5 turns
- Export session history to markdown

## Commands

```bash
# Install and link globally
npm install
npm link

# Enable/disable hooks in ~/.claude/settings.json
claude-guard enable
claude-guard disable

# View status and stats
claude-guard status
claude-guard stats
claude-guard stats --period=week
claude-guard stats --daily

# Export session to markdown
claude-guard export
claude-guard export --here --name="session-name"
```

## Architecture

### Hook System
The tool registers four hooks in `~/.claude/settings.json`:

1. **SessionStart** (`src/hooks/session-start.js`): Checks for crashed sessions (active > 10 minutes with current.json), marks them as crashed, and injects recovery context into the new session.

2. **PostToolUse** (`src/hooks/post-tool-use.js`): Saves current state to `current.json` after each tool use. Generates summaries every 5 turns.

3. **Stop** (`src/hooks/stop.js`): Parses transcript file for token usage (input tokens use last value since context grows; output tokens are summed). Marks session completed.

4. **SessionEnd** (`src/hooks/session-end.js`): Final cleanup, ensures session status is set to completed.

### Data Flow
- All hooks read JSON from stdin, output JSON with `{ continue: true }` to stdout
- Session data stored in `~/.claude-guard/sessions/{session_id}/`
- SQLite database at `~/.claude-guard/guard.db` for queries and stats

### Key Libraries
- `src/lib/db.js`: SQLite operations using sql.js (no native build required)
- `src/lib/session.js`: File-based session state management
- `src/lib/summarizer.js`: Rule-based summary generation from tool usage patterns
- `src/lib/token-tracker.js`: Token counting and cost calculation

### CLI Structure
`src/cli/index.js` routes commands:
- User commands: `enable`, `disable`, `status`, `stats`, `export`
- Internal hook commands: `session-start`, `track`, `summarize`, `finalize`

## Data Storage

```
~/.claude-guard/
├── guard.db              # SQLite: sessions, token_usage, summaries tables
└── sessions/{id}/
    ├── meta.json         # Session metadata
    ├── current.json      # Last tool state (for crash recovery)
    ├── summaries.jsonl   # Append-only summary log
    └── tokens.json       # Per-turn token breakdown
```

## Known Limitations

- Output token counts may be lower than actual due to Claude Code transcript streaming behavior
- Crash detection requires both: session inactive > 10 minutes AND current.json exists
