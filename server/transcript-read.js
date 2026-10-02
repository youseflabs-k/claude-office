import { open, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// Reads the tail of a transcript for display. Transcripts reach 100MB+, so the
// file is never read whole: it is walked backwards in chunks until enough
// lines have been collected, then stops.

const MAX_LINES = 240;
const CHUNK = 64 << 10;            // 1MB per backward step
const MAX_BYTES = 512 << 10;       // never hold more than this in memory

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function entryFor(record) {
  const message = record.message;
  if (!message || typeof message !== 'object') return null;

  const blocks = Array.isArray(message.content) ? message.content : [];

  for (const block of blocks) {
    if (block?.type === 'tool_use') {
      const input = block.input ?? {};
      const hint = input.file_path ?? input.path ?? input.command
        ?? input.pattern ?? input.description ?? input.prompt ?? '';
      return {
        kind: 'tool',
        tool: block.name,
        detail: String(hint).slice(0, 2000),
        at: record.timestamp ?? null,
      };
    }
  }

  const text = textOf(message.content);
  if (!text) return null;

  return {
    kind: record.type === 'user' ? 'user' : 'assistant',
    text: text.length > 4000 ? text.slice(0, 4000) + '\n[Long message trimmed in the live tail.]' : text,
    at: record.timestamp ?? null,
  };
}

// Walk backwards a chunk at a time until MAX_LINES complete lines are held, or
// the file start is reached, or the byte ceiling trips.
async function tailLines(path, maxLines) {
  const info = await stat(path); const { size } = info;
  const fh = await open(path, 'r');
  try {
    let end = size;
    let held = '';
    let truncated = false;

    while (end > 0) {
      const start = Math.max(0, end - CHUNK);
      const buf = Buffer.alloc(end - start);
      await fh.read(buf, 0, buf.length, start);
      held = buf.toString('utf8') + held;
      end = start;

      const count = held.split('\n').length;
      if (count > maxLines) break;
      if (held.length >= MAX_BYTES) {
        truncated = true;
        break;
      }
    }

    const lines = held.split('\n');
    // A chunk boundary almost certainly lands mid-record, so drop the first
    // partial line unless the whole file was read.
    if (end > 0 || truncated) lines.shift();
    return { lines: lines.slice(-maxLines), truncated: truncated || end > 0, version:`${info.mtimeMs}:${info.size}` };
  } finally {
    await fh.close();
  }
}

export async function readTail(session, agentId, maxLines = MAX_LINES) {
  if (!session?.path) return { entries: [], source: null, truncated: false };

  let path = session.path;
  if (agentId && agentId !== session.id && /^[a-zA-Z0-9_-]+$/.test(agentId)) {
    const candidate = join(dirname(session.path), session.id, 'subagents', `${agentId}.jsonl`);
    try {
      await stat(candidate);
      path = candidate;
    } catch {
      // The subagent transcript may not exist yet; fall back to the session.
    }
  }

  try {
    const { lines, truncated, version } = await tailLines(path, maxLines);
    const entries = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = entryFor(record);
      if (entry) entries.push(entry);
    }
    return { entries: entries.slice(-120), source: path, truncated: truncated || entries.length > 120, version };
  } catch {
    return { entries: [], source: path, truncated: false };
  }
}
