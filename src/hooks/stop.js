#!/usr/bin/env node

/**
 * Stop Hook
 * - Track token usage (once per response)
 * - Generate final summary
 * - Mark session as completed
 */

import { getSession, markSessionCompleted, addSummary, addTokenUsage } from '../lib/db.js';
import { getCurrentState, appendSummary as appendSummaryToFile } from '../lib/session.js';
import { readFileSync } from 'fs';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

/**
 * Extract all unique token usage from transcript file
 */
function extractAllTokensFromTranscript(transcriptPath) {
  let totalInput = 0;
  let totalOutput = 0;
  let model = 'unknown';
  const seenIds = new Set();

  try {
    const content = readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.usage && entry.message?.id) {
          const msgId = entry.message.id;
          if (seenIds.has(msgId)) continue;
          seenIds.add(msgId);

          const usage = entry.message.usage;
          totalInput += (usage.input_tokens || 0) +
                       (usage.cache_creation_input_tokens || 0) +
                       (usage.cache_read_input_tokens || 0);
          totalOutput += usage.output_tokens || 0;
          model = entry.message.model || model;
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // File error
  }

  return { totalInput, totalOutput, model, messageCount: seenIds.size };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const event = JSON.parse(input);
  const { session_id, transcript_path } = event;

  const session = await getSession(session_id);
  if (!session) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Track tokens once at the end
  if (transcript_path) {
    const { totalInput, totalOutput, model, messageCount } = extractAllTokensFromTranscript(transcript_path);
    if (totalInput > 0 || totalOutput > 0) {
      await addTokenUsage(session_id, messageCount, totalInput, totalOutput, model);
    }
  }

  const currentState = getCurrentState(session_id);
  const currentTurn = currentState?.turn || session.total_turns || 0;
  const lastSummaryTurn = session.last_summary_turn || 0;

  // Generate final summary if there are unsummarized turns
  if (currentTurn > lastSummaryTurn) {
    const summary = {
      turns: `${lastSummaryTurn + 1}-${currentTurn}`,
      summary: currentState?.last_tool ? `최종: ${currentState.last_tool}` : '세션 종료',
      files_read: [],
      files_modified: currentState?.last_tool_input?.file_path ? [currentState.last_tool_input.file_path] : [],
      tokens_used: 0,
      created_at: new Date().toISOString()
    };

    appendSummaryToFile(session_id, summary);
    await addSummary(session_id, lastSummaryTurn + 1, currentTurn, summary.summary, summary.files_read, summary.files_modified, 0);
  }

  await markSessionCompleted(session_id);
  console.log(JSON.stringify({ continue: true }));
}

main().catch(err => {
  console.error(`[claude-guard] Error: ${err.message}`);
  console.log(JSON.stringify({ continue: true }));
});
