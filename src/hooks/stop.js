#!/usr/bin/env node

/**
 * Stop Hook
 * - Track token usage (once per response)
 * - Generate final summary
 * - Mark session as completed
 */

import { getSession, markSessionCompleted, addSummary, addTokenUsage, updateSession } from '../lib/db.js';
import { getCurrentState, appendSummary as appendSummaryToFile, updateMetaStatus } from '../lib/session.js';
import { readFileSync, existsSync } from 'fs';

// Force UTF-8
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

/**
 * Extract token usage from transcript file
 * NOTE: input_tokens is the total context size for each request, not incremental.
 * We use the LAST message's input_tokens as the total context used,
 * and SUM all output_tokens since each response is separate output.
 */
function extractAllTokensFromTranscript(transcriptPath) {
  let lastInputTokens = 0;
  let totalOutput = 0;
  let model = 'unknown';
  let messageCount = 0;

  if (!transcriptPath || !existsSync(transcriptPath)) {
    return { totalInput: 0, totalOutput: 0, model, messageCount };
  }

  try {
    const content = readFileSync(transcriptPath, 'utf8');
    if (!content || !content.trim()) {
      return { totalInput: 0, totalOutput: 0, model, messageCount };
    }

    const lines = content.trim().split('\n');
    const seenIds = new Set();

    for (const line of lines) {
      if (!line || !line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        if (entry?.type === 'assistant' && entry?.message?.usage && entry?.message?.id) {
          const msgId = entry.message.id;
          if (seenIds.has(msgId)) continue;
          seenIds.add(msgId);

          const usage = entry.message.usage;
          // Keep track of the latest input_tokens (context size grows over conversation)
          const currentInput = (usage.input_tokens || 0) +
                              (usage.cache_creation_input_tokens || 0) +
                              (usage.cache_read_input_tokens || 0);
          lastInputTokens = currentInput; // Use last value, not sum

          // Sum output tokens (each response is separate)
          totalOutput += usage.output_tokens || 0;
          model = entry.message.model || model;
        }
      } catch {
        // Skip invalid lines
      }
    }

    messageCount = seenIds.size;
  } catch {
    // File error
  }

  return { totalInput: lastInputTokens, totalOutput, model, messageCount };
}

async function main() {
  try {
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
    const transcript_path = event.transcript_path;

    if (!session_id) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const session = await getSession(session_id);
    if (!session) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Track tokens once at the end
    if (transcript_path) {
      try {
        const { totalInput, totalOutput, model, messageCount } = extractAllTokensFromTranscript(transcript_path);
        if (totalInput > 0 || totalOutput > 0) {
          await addTokenUsage(session_id, messageCount, totalInput, totalOutput, model);
        }
      } catch {
        // Ignore token tracking errors
      }
    }

    const currentState = getCurrentState(session_id);
    const currentTurn = currentState?.turn || session.total_turns || 0;
    const lastSummaryTurn = session.last_summary_turn || 0;

    // Generate final summary if there are unsummarized turns
    if (currentTurn > lastSummaryTurn) {
      try {
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
        // Update last_summary_turn to prevent overlapping summaries on resume
        await updateSession(session_id, { last_summary_turn: currentTurn });
      } catch {
        // Ignore summary errors
      }
    }

    await markSessionCompleted(session_id);
    updateMetaStatus(session_id, 'completed');
    console.log(JSON.stringify({ continue: true }));
  } catch (err) {
    console.error(`[claude-guard] Error: ${err?.message || 'unknown'}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
