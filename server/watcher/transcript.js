import { open, stat } from 'node:fs/promises';
import { activityRecord, readActivity } from './claude-activity.js';
import { agentTool, agentTokens, agentStop, sessionCwd } from '../state/events.js';

// One tailer per transcript, and there are two kinds:
//
//   parent   <sessionId>.jsonl          agentId null   -> agent.stop only
//   subagent subagents/agent-X.jsonl    agentId bound  -> agent.tool, agent.tokens
//
// This split matters. Each subagent has its own transcript carrying its own
// tool calls and token usage; the parent transcript's tool calls belong to the
// main session, not to any subagent. Emitting tool or token events with a null
// agentId is useless because fold() looks them up by agentId and drops misses.
export function createTailer({
  path,
  sessionId,
  agentId = null,
  isSession = false,
  offset = 0,
  agentsByToolUseId,
  onEvent,
}) {
  let position = offset;
  let carry = '';
  let lastCwd = null;
  let activeToolUseId = null;

  function emit(record) {
    const at = Date.now();
    const activity = activityRecord(record, {allowSidechain:!isSession});
    if (agentId && activity) onEvent({ kind:'agent.activity', sessionId, agentId, ...activity });

    // A session moves around: it may start in one project and spend the next
    // hour in a subdirectory. The registry only knows where it started, so the
    // working directory is tracked from the transcript instead.
    if (isSession && record.cwd && record.cwd !== lastCwd) {
      lastCwd = record.cwd;
      onEvent(sessionCwd({ sessionId, cwd: record.cwd, at }));
    }

    const message = record.message;
    if (!message || typeof message !== 'object') return;

    if (agentId && message.usage && typeof message.usage.output_tokens === 'number') {
      onEvent(agentTokens({ sessionId, agentId, delta: message.usage.output_tokens, at }));
    }

    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;

      if (agentId && block.type === 'tool_use' && block.name && block.name !== 'Task') {
        activeToolUseId = block.id;
        onEvent(agentTool({ sessionId, agentId, tool: block.name, at }));
      }

      // The verified departure signal: the parent transcript records a
      // tool_result carrying the spawning tool_use id when an agent finishes.
      if (block.type === 'tool_result' && block.tool_use_id) {
        if (block.tool_use_id === activeToolUseId) { activeToolUseId = null; onEvent(agentTool({ sessionId, agentId, tool: null, at })); }
        const finished = agentsByToolUseId.get(block.tool_use_id);
        if (finished) onEvent(agentStop({ sessionId, agentId: finished, at }));
      }
    }
  }

  async function readAppend() {
    let size;
    try {
      ({ size } = await stat(path));
    } catch {
      return position;
    }

    if (size < position) {
      position = 0; // rotated or truncated
      carry = '';
    }
    if (size === position) return position;

    const fh = await open(path, 'r');
    try {
      const length = Math.min(size - position, 256 * 1024);
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, position);
      position += length;

      const text = carry + buf.toString('utf8');
      const lines = text.split('\n');
      carry = lines.pop() ?? ''; // hold the partial trailing line for next read

      for (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        emit(record);
      }

      if (lines.length) onEvent({ kind:'transcript.changed', sessionId, agentId, at:Date.now() });
      return position;
    } finally {
      await fh.close();
    }
  }

  let inFlight = null;
  let initialized = false;
  return {
    read() {
      if (!inFlight) inFlight = (async () => {
        if (!initialized) {
          initialized = true;
          if (isSession && agentId) {
            const activity = await readActivity(path);
            if (activity) onEvent({kind:'agent.activity',sessionId,agentId,...activity});
          }
        }
        return readAppend();
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    stop() {
      carry = '';
    },
  };
}
