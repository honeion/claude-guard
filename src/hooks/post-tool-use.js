#!/usr/bin/env node

/**
 * PostToolUse Hook
 * - Save current state after each tool execution
 * - Generate summary every N turns
 * - Token tracking moved to Stop hook for performance
 */

import { updateSession, addSummary, getSession } from '../lib/db.js';
import { saveCurrentState, appendSummary as appendSummaryToFile } from '../lib/session.js';
import { generateSummary, shouldSummarize } from '../lib/summarizer.js';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

// In-memory turn buffer for summarization
const turnBuffer = [];

async function main() {
  try {
    // Read input from stdin
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    if (!input || !input.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    let event;
    try {
      event = JSON.parse(input);
    } catch {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    if (!event || typeof event !== 'object') {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const session_id = event.session_id;
    const tool_name = event.tool_name || '';
    const tool_input = event.tool_input || {};
    const tool_use_id = event.tool_use_id || '';
    const cwd = event.cwd || '';

    if (!session_id) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Get current session
    const session = await getSession(session_id);
    if (!session) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const currentTurn = (session.total_turns || 0) + 1;

    // Save current state (lightweight, no token parsing)
    const currentState = {
      turn: currentTurn,
      last_tool: tool_name,
      last_tool_input: tool_input,
      last_tool_id: tool_use_id,
      cwd,
      status: 'in_progress'
    };

    await saveCurrentState(session_id, currentState);

    // Add to turn buffer for summarization
    turnBuffer.push({
      turn: currentTurn,
      tool_name,
      tool_input
    });

    // Check if we should generate a summary
    const lastSummaryTurn = session.last_summary_turn || 0;

    if (shouldSummarize(currentTurn, lastSummaryTurn)) {
      const turnStart = lastSummaryTurn + 1;
      const turnEnd = currentTurn;
      const batchTurns = turnBuffer.filter(t => t.turn >= turnStart && t.turn <= turnEnd);

      if (batchTurns.length > 0) {
        try {
          const summary = generateSummary(batchTurns, turnStart, turnEnd);
          appendSummaryToFile(session_id, summary);
          await addSummary(session_id, turnStart, turnEnd, summary.summary || '', summary.files_read || [], summary.files_modified || [], 0);
          await updateSession(session_id, { last_summary_turn: turnEnd });
        } catch {
          // Ignore summary errors
        }
        turnBuffer.length = 0;
      }
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (err) {
    console.error(`[claude-guard] Error: ${err?.message || 'unknown'}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
