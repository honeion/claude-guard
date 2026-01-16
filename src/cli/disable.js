/**
 * Disable claude-guard hooks
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

export async function disable() {
  if (!existsSync(CLAUDE_SETTINGS_FILE)) {
    console.log('No Claude settings file found. Nothing to disable.');
    return;
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading settings file:', e.message);
    return;
  }

  if (!settings.hooks) {
    console.log('No hooks configured. Nothing to disable.');
    return;
  }

  // Remove our hooks from each event
  const events = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'];
  let removed = 0;

  for (const event of events) {
    if (settings.hooks[event]) {
      const before = settings.hooks[event].length;

      settings.hooks[event] = settings.hooks[event].filter(h => {
        const hasOurHook = h.hooks?.some(hh =>
          hh.command?.includes('claude-guard') || hh.command?.includes('index.js')
        );
        return !hasOurHook;
      });

      removed += before - settings.hooks[event].length;

      // Remove empty arrays
      if (settings.hooks[event].length === 0) {
        delete settings.hooks[event];
      }
    }
  }

  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write settings
  writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));

  console.log(`claude-guard disabled (${removed} hooks removed)`);
  console.log(`Settings updated: ${CLAUDE_SETTINGS_FILE}`);
}
