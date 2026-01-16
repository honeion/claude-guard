#!/usr/bin/env node

/**
 * claude-guard CLI
 */

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'enable':
      const { enable } = await import('./enable.js');
      await enable();
      break;

    case 'disable':
      const { disable } = await import('./disable.js');
      await disable();
      break;

    case 'stats':
      const { stats } = await import('./stats.js');
      await stats(args.slice(1));
      break;

    case 'export':
      const { exportSession } = await import('./export.js');
      await exportSession(args.slice(1));
      break;

    case 'session-start':
      // Internal hook command
      await import('../hooks/session-start.js');
      break;

    case 'track':
      // Internal hook command
      await import('../hooks/post-tool-use.js');
      break;

    case 'summarize':
      // Internal hook command
      await import('../hooks/stop.js');
      break;

    case 'finalize':
      // Internal hook command
      await import('../hooks/session-end.js');
      break;

    case 'status':
      const { status } = await import('./status.js');
      await status();
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}

function showHelp() {
  console.log(`
claude-guard - Session protection for Claude Code

Usage:
  claude-guard <command> [options]

Commands:
  enable          Enable claude-guard hooks
  disable         Disable claude-guard hooks
  status          Show current status
  stats           Show token usage statistics
  export          Export session as markdown

Stats Options:
  --session=ID    Stats for specific session
  --period=day    Stats for period (day/week/month/all)

Export Options:
  --session=ID    Export specific session
  --here          Save to current directory
  --name=NAME     Custom filename

Examples:
  claude-guard enable
  claude-guard stats --period=week
  claude-guard export --session=abc123 --here
`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
