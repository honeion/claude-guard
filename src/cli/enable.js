/**
 * Enable claude-guard hooks
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

const CLAUDE_SETTINGS_DIR = join(homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = join(CLAUDE_SETTINGS_DIR, 'settings.json');

// Get the path to our CLI
const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', 'src', 'cli', 'index.js'));

const HOOKS_CONFIG = {
  SessionStart: [{
    matcher: 'startup|resume',
    hooks: [{
      type: 'command',
      command: `node "${CLI_PATH}" session-start`
    }]
  }],
  PostToolUse: [{
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `node "${CLI_PATH}" track`
    }]
  }],
  Stop: [{
    hooks: [{
      type: 'command',
      command: `node "${CLI_PATH}" summarize`
    }]
  }],
  SessionEnd: [{
    hooks: [{
      type: 'command',
      command: `node "${CLI_PATH}" finalize`
    }]
  }]
};

export async function enable() {
  // Ensure .claude directory exists
  if (!existsSync(CLAUDE_SETTINGS_DIR)) {
    mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
  }

  // Read existing settings or create new
  let settings = {};
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.error('Warning: Could not parse existing settings, creating new file');
    }
  }

  // Merge hooks
  settings.hooks = settings.hooks || {};

  for (const [event, config] of Object.entries(HOOKS_CONFIG)) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = config;
    } else {
      // Check if our hook already exists
      const hasOurHook = settings.hooks[event].some(h =>
        h.hooks?.some(hh => hh.command?.includes('claude-guard') || hh.command?.includes(CLI_PATH))
      );

      if (!hasOurHook) {
        settings.hooks[event].push(...config);
      }
    }
  }

  // Write settings
  writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));

  console.log('claude-guard enabled');
  console.log(`Settings updated: ${CLAUDE_SETTINGS_FILE}`);
  console.log('\nHooks registered:');
  console.log('  - SessionStart: Crash recovery');
  console.log('  - PostToolUse: State tracking');
  console.log('  - Stop: Session summary');
  console.log('  - SessionEnd: Cleanup');
}
