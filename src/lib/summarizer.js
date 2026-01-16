/**
 * Rule-based summarizer - NO API calls
 * Generates summaries based on tool usage patterns
 */

const SUMMARY_INTERVAL = 5; // Summarize every 5 turns

// Tool action descriptions
const TOOL_ACTIONS = {
  Read: (input) => `Read ${input.file_path?.split('/').pop() || 'file'}`,
  Write: (input) => `Created ${input.file_path?.split('/').pop() || 'file'}`,
  Edit: (input) => `Modified ${input.file_path?.split('/').pop() || 'file'}`,
  Bash: (input) => {
    const cmd = input.command || '';
    if (cmd.startsWith('npm ')) return `npm: ${cmd.slice(4, 30)}`;
    if (cmd.startsWith('git ')) return `git: ${cmd.slice(4, 30)}`;
    if (cmd.startsWith('cd ')) return `Changed directory`;
    return `Ran: ${cmd.slice(0, 30)}${cmd.length > 30 ? '...' : ''}`;
  },
  Glob: (input) => `Searched files: ${input.pattern || ''}`,
  Grep: (input) => `Searched content: ${input.pattern || ''}`,
  Task: (input) => `Subagent task`,
  WebFetch: (input) => `Fetched URL`,
  WebSearch: (input) => `Web search: ${(input.query || '').slice(0, 30)}`
};

// Extract key actions from turns
export function extractKeyActions(turns) {
  const actions = [];

  for (const turn of turns) {
    if (!turn.tool_name) continue;

    const extractor = TOOL_ACTIONS[turn.tool_name];
    if (extractor) {
      actions.push(extractor(turn.tool_input || {}));
    } else {
      actions.push(`Used ${turn.tool_name}`);
    }
  }

  // Deduplicate similar actions
  const unique = [...new Set(actions)];

  return unique.slice(0, 5).join('. '); // Max 5 actions
}

// Collect files read from turns
export function collectFilesRead(turns) {
  const files = new Set();

  for (const turn of turns) {
    if (turn.tool_name === 'Read' && turn.tool_input?.file_path) {
      files.add(turn.tool_input.file_path);
    }
  }

  return [...files];
}

// Collect files modified from turns
export function collectFilesModified(turns) {
  const files = new Set();

  for (const turn of turns) {
    if ((turn.tool_name === 'Write' || turn.tool_name === 'Edit') && turn.tool_input?.file_path) {
      files.add(turn.tool_input.file_path);
    }
  }

  return [...files];
}

// Sum tokens from turns
export function sumTokens(turns) {
  return turns.reduce((sum, t) => sum + (t.input_tokens || 0) + (t.output_tokens || 0), 0);
}

// Generate summary for a batch of turns
export function generateSummary(turns, turnStart, turnEnd) {
  return {
    turns: `${turnStart}-${turnEnd}`,
    summary: extractKeyActions(turns) || 'No tool usage recorded',
    files_read: collectFilesRead(turns),
    files_modified: collectFilesModified(turns),
    tokens_used: sumTokens(turns),
    created_at: new Date().toISOString()
  };
}

// Check if summary is needed
export function shouldSummarize(currentTurn, lastSummaryTurn) {
  return currentTurn - lastSummaryTurn >= SUMMARY_INTERVAL;
}

export { SUMMARY_INTERVAL };
