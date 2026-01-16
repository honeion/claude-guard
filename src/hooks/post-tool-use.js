#!/usr/bin/env node

/**
 * PostToolUse Hook
 * - Save current state after each tool execution
 * - Track token usage
 * - Generate summary every N turns
 */

import { updateSession, addSummary, getSession } from '../lib/db.js';
import { saveCurrentState, appendSummary as appendSummaryToFile } from '../lib/session.js';
import { updateTokenUsage } from '../lib/session.js';
import { generateSummary, shouldSummarize, SUMMARY_INTERVAL } from '../lib/summarizer.js';
import { trackTokens } from '../lib/token-tracker.js';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

// In-memory turn buffer for summarization
const turnBuffer = [];

async function main() {
  // Read input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const event = JSON.parse(input);
  const {
    session_id,
    tool_name,
    tool_input,
    tool_use_id,
    cwd
  } = event;

  // Get current session
  const session = await getSession(session_id);
  if (!session) {
    // Session not initialized, skip
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const currentTurn = (session.total_turns || 0) + 1;

  // Extract token info if available (from tool result)
  const inputTokens = event.input_tokens || 0;
  const outputTokens = event.output_tokens || 0;
  const model = event.model || 'unknown';

  // Track tokens in DB
  if (inputTokens > 0 || outputTokens > 0) {
    await trackTokens(session_id, currentTurn, inputTokens, outputTokens, model);
    updateTokenUsage(session_id, currentTurn, inputTokens, outputTokens);
  }

  // Save current state
  const currentState = {
    turn: currentTurn,
    last_tool: tool_name,
    last_tool_input: tool_input,
    last_tool_id: tool_use_id,
    cwd,
    status: 'in_progress',
    input_tokens: inputTokens,
    output_tokens: outputTokens
  };

  await saveCurrentState(session_id, currentState);

  // Add to turn buffer for summarization
  turnBuffer.push({
    turn: currentTurn,
    tool_name,
    tool_input,
    input_tokens: inputTokens,
    output_tokens: outputTokens
  });

  // Check if we should generate a summary
  const lastSummaryTurn = session.last_summary_turn || 0;

  if (shouldSummarize(currentTurn, lastSummaryTurn)) {
    const turnStart = lastSummaryTurn + 1;
    const turnEnd = currentTurn;

    // Get turns for this batch
    const batchTurns = turnBuffer.filter(t => t.turn >= turnStart && t.turn <= turnEnd);

    if (batchTurns.length > 0) {
      const summary = generateSummary(batchTurns, turnStart, turnEnd);

      // Save to file and DB
      appendSummaryToFile(session_id, summary);
      await addSummary(
        session_id,
        turnStart,
        turnEnd,
        summary.summary,
        summary.files_read,
        summary.files_modified,
        summary.tokens_used
      );

      // Update last summary turn
      await updateSession(session_id, { last_summary_turn: turnEnd });

      // Clear processed turns from buffer
      turnBuffer.length = 0;
    }
  }

  // Output success
  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  // Non-blocking error - continue anyway
  console.log(JSON.stringify({ continue: true }));
});
