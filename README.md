# claude-guard

Lightweight session protection and token tracking for Claude Code.

## Features

- **Session Protection**: Auto-save on every turn, recover from VSCode crashes
- **Crash Recovery**: Detect abnormal termination and restore context
- **Token Tracking**: Track usage by session, period, and export stats
- **Incremental Summaries**: Progressive summarization without API calls
- **Easy On/Off**: Simple CLI to enable/disable
- **MD Export**: Export session history as markdown

## Installation

```bash
npm install -g claude-guard
claude-guard enable
```

## Usage

```bash
# Enable/Disable
claude-guard enable
claude-guard disable

# View stats
claude-guard stats
claude-guard stats --period=week
claude-guard stats --session=abc123

# Export session as markdown
claude-guard export
claude-guard export --session=abc123
claude-guard export --here  # Save to current project folder
```

## How It Works

claude-guard uses Claude Code hooks to:

1. **SessionStart**: Check for crashed sessions, inject recovery context
2. **PostToolUse**: Save current state after each tool execution
3. **Stop**: Mark session as completed, generate summary
4. **SessionEnd**: Finalize stats and cleanup

## Data Storage

```
~/.claude-guard/
├── guard.db              # Stats and index
└── sessions/
    └── {session_id}/
        ├── meta.json         # Session metadata
        ├── summaries.jsonl   # Incremental summaries
        ├── current.json      # Current turn state
        └── tokens.json       # Token usage
```

## License

MIT
