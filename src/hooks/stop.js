#!/usr/bin/env node

/**
 * Stop Hook
 * - Mark session as completed
 * - Generate final summary for remaining turns
 */

import { getSession, updateSession, markSessionCompleted, addSummary } from '../lib/db.js';
import { getCurrentState, appendSummary as appendSummaryToFile } from '../lib/session.js';
import { generateSummary } from '../lib/summarizer.js';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

async function main() {
  // Read input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const event = JSON.parse(input);
  const { session_id } = event;

  const session = getSession(session_id);
  if (!session) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const currentState = getCurrentState(session_id);
  const currentTurn = currentState?.turn || session.total_turns || 0;
  const lastSummaryTurn = session.last_summary_turn || 0;

  // Generate final summary if there are unsummarized turns
  if (currentTurn > lastSummaryTurn) {
    const turnStart = lastSummaryTurn + 1;
    const turnEnd = currentTurn;

    // We don't have the full turn data here, so create a minimal summary
    const summary = {
      turns: `${turnStart}-${turnEnd}`,
      summary: currentState?.last_tool
        ? `Final: ${currentState.last_tool} on ${currentState.last_tool_input?.file_path || 'unknown'}`
        : 'Session ended',
      files_read: [],
      files_modified: currentState?.last_tool_input?.file_path
        ? [currentState.last_tool_input.file_path]
        : [],
      tokens_used: (currentState?.input_tokens || 0) + (currentState?.output_tokens || 0),
      created_at: new Date().toISOString()
    };

    appendSummaryToFile(session_id, summary);
    addSummary(
      session_id,
      turnStart,
      turnEnd,
      summary.summary,
      summary.files_read,
      summary.files_modified,
      summary.tokens_used
    );
  }

  // Mark session as completed
  markSessionCompleted(session_id);

  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  console.log(JSON.stringify({ continue: true }));
});
