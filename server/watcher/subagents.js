import { watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentStart } from '../state/events.js';

// A subagent announces itself by the appearance of
// <project>/<sessionId>/subagents/agent-X.meta.json. That file carries
// everything a sprite needs and is never updated afterwards, which is why
// departure has to be derived elsewhere (see transcript.js).
//
// The first scan is silent. Every meta.json already on disk belongs to an
// agent that ran in the past, and its departure signal sits in a tool_result
// the parent tailer will never replay (it starts at end-of-file). Emitting
// them would seat hundreds of finished agents as if they were live. Only
// files that appear after the watcher starts produce an agent.start.
export function watchSubagents(projectDir, onEvent, { interval = 40 } = {}) {
  const seen = new Set();
  let seeded = false;
  let timer = null;
  let watcher = null;

  async function scan() {
    let sessionDirs;
    try {
      sessionDirs = (await readdir(projectDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return;
    }

    for (const sessionId of sessionDirs) {
      const subDir = join(projectDir, sessionId, 'subagents');
      let metaFiles;
      try {
        metaFiles = (await readdir(subDir)).filter((f) => f.endsWith('.meta.json'));
      } catch {
        continue;
      }

      for (const metaFile of metaFiles) {
        const agentId = metaFile.replace(/\.meta\.json$/, '');
        if (seen.has(agentId)) continue;

        if (!seeded) {
          seen.add(agentId); // pre-existing: record it, do not seat it
          continue;
        }

        let meta;
        try {
          meta = JSON.parse(await readFile(join(subDir, metaFile), 'utf8'));
        } catch {
          continue; // mid-write; retry on the next scan
        }

        seen.add(agentId);
        onEvent(agentStart({
          sessionId,
          agentId,
          agentType: meta.agentType ?? 'unknown',
          description: meta.description ?? '',
          model: meta.model ?? null,
          spawnDepth: meta.spawnDepth ?? 1,
          parentAgentId: meta.parentAgentId ?? null,
          toolUseId: meta.toolUseId ?? null,
          at: Date.now(),
        }));
      }
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scan()
        .catch(() => {})
        .finally(() => {
          seeded = true; // every later scan emits normally
        });
    }, interval);
  };

  try {
    // Recursive watch is unavailable on Linux; the interval poll covers it.
    watcher = watch(projectDir, { recursive: true }, schedule);
  } catch {
    watcher = null;
  }
  schedule();
  const poll = setInterval(schedule, 400);

  return {
    stop() {
      clearTimeout(timer);
      clearInterval(poll);
      if (watcher) watcher.close();
    },
  };
}
