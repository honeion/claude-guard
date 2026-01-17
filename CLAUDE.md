# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

claude-guard is a **lightweight** session protection and token tracking tool for Claude Code. Uses file-based storage (no database, no WASM).

## Commands

```bash
# Install and link globally
npm link

# Enable/disable hooks
claude-guard enable
claude-guard disable

# View status and stats
claude-guard status
claude-guard stats
claude-guard stats --period=week
claude-guard stats --daily

# Export session
claude-guard export
claude-guard export --here
```

## Architecture

### Design Philosophy
- **Minimal overhead**: PostToolUse hook only writes a tiny JSON file
- **No dependencies**: Pure Node.js file operations, no sql.js/WASM
- **Fail-safe**: All hooks catch errors and return `{continue: true}`

### Hook System

1. **SessionStart** (`src/hooks/session-start.js`): Checks for crashed sessions, initializes new session
2. **PostToolUse** (`src/hooks/post-tool-use.js`): Only writes `current.json` (50 bytes, ~1ms)
3. **Stop** (`src/hooks/stop.js`): Token extraction from transcript, session finalization
4. **SessionEnd** (`src/hooks/session-end.js`): Final cleanup

### Data Storage

```
~/.claude-guard/
├── sessions.json     # All sessions metadata
├── tokens.json       # Token usage per session and daily aggregates
└── sessions/{id}/
    ├── current.json      # Last tool state (for crash recovery)
    └── summaries.jsonl   # Session summaries
```

### Key Files

- `src/lib/db.js`: File-based storage operations
- `src/lib/token-tracker.js`: Token counting and cost calculation
- `src/cli/`: CLI commands (enable, disable, status, stats, export)

## Performance

PostToolUse is the critical path (runs on every tool use):
- Reads: 0 (no reads)
- Writes: 1 file (~50 bytes)
- Time: <5ms typically
