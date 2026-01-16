#!/usr/bin/env node

/**
 * Install/Uninstall claude-guard
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const isUninstall = args.includes('--uninstall');

async function main() {
  if (isUninstall) {
    await uninstall();
  } else {
    await install();
  }
}

async function install() {
  console.log('Installing claude-guard...\n');

  // Check Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    console.error(`Error: Node.js 18+ required (current: ${nodeVersion})`);
    process.exit(1);
  }

  // Install dependencies
  console.log('Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: join(import.meta.dirname, '..') });
  } catch (e) {
    console.error('Failed to install dependencies');
    process.exit(1);
  }

  // Enable hooks
  console.log('\nEnabling hooks...');
  const { enable } = await import('../src/cli/enable.js');
  await enable();

  console.log('\n✓ claude-guard installed successfully!\n');
  console.log('Commands:');
  console.log('  claude-guard status   - Check status');
  console.log('  claude-guard stats    - View token usage');
  console.log('  claude-guard export   - Export session to markdown');
  console.log('  claude-guard disable  - Disable hooks');
}

async function uninstall() {
  console.log('Uninstalling claude-guard...\n');

  // Disable hooks
  const { disable } = await import('../src/cli/disable.js');
  await disable();

  console.log('\n✓ claude-guard uninstalled');
  console.log('Note: Data in ~/.claude-guard/ has been preserved.');
  console.log('Delete manually if no longer needed.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
