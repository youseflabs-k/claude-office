import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { SESSIONS_DIR, TAIL_INTERVAL_MS } from '../config.js';
import { watchRegistry } from './registry.js';
import { watchSubagents } from './subagents.js';
import { createTailer } from './transcript.js';

export function startWatching({ index, onEvent }) {
  const stops = [];

  stops.push(watchRegistry(SESSIONS_DIR, (event) => {
    // The registry knows nothing about projects; attach the id from the index.
    if (event.kind === 'session.start') {
      const session = index.sessions[event.sessionId];
      event.projectId = session ? session.projectId : null;
    }
    onEvent(event);
  }));

  // Join key between a spawned agent and the tool_result that ends it.
  const byToolUseId = new Map();
  for (const agent of Object.values(index.agents)) {
    if (agent.toolUseId) byToolUseId.set(agent.toolUseId, agent.id);
  }

  for (const project of Object.values(index.projects)) {
    if (!project.dir) continue;
    stops.push(watchSubagents(project.dir, (event) => {
      if (event.toolUseId) byToolUseId.set(event.toolUseId, event.agentId);
      event.projectId = project.id;
      onEvent(event);
    }));
  }

  const tailers = new Map();

  function tailerFor({ key, path, sessionId, agentId, isSession = false, startAt }) {
    let tailer = tailers.get(key);
    if (!tailer) {
      tailer = createTailer({
        path,
        sessionId,
        agentId,
        isSession,
        offset: index.offsets[key] ?? startAt,
        agentsByToolUseId: byToolUseId,
        onEvent,
      });
      tailers.set(key, tailer);
    }
    return tailer;
  }

  const tick = setInterval(async () => {
    for (const session of Object.values(index.sessions)) {
      // Parent transcript: start at current end of file so history is not
      // replayed as if it were happening now.
      const parent = tailerFor({
        key: session.id,
        path: session.path,
        sessionId: session.id,
        // Bound to the session's own occupant so the main session's tool
        // calls and token burn show up on its sprite.
        agentId: session.id,
        isSession: true,
        startAt: session.sizeBytes,
      });
      try {
        index.offsets[session.id] = await parent.read();
      } catch {
        // transient; next tick retries
      }

      // Subagent transcripts: read from the start, since an agent's whole life
      // is short and its token total should reflect all of it.
      const subDir = join(dirname(session.path), session.id, 'subagents');
      let agentFiles = [];
      try {
        agentFiles = (await readdir(subDir)).filter((f) => f.endsWith('.jsonl'));
      } catch {
        agentFiles = [];
      }

      for (const file of agentFiles) {
        const agentId = file.replace(/\.jsonl$/, '');
        const key = `${session.id}:${agentId}`;
        const sub = tailerFor({
          key,
          path: join(subDir, file),
          sessionId: session.id,
          agentId,
          startAt: 0,
        });
        try {
          index.offsets[key] = await sub.read();
        } catch {
          // transient; next tick retries
        }
      }
    }
  }, TAIL_INTERVAL_MS);

  return {
    stop() {
      clearInterval(tick);
      for (const s of stops) s.stop();
    },
  };
}
