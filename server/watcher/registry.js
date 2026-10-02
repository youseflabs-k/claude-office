import { watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionStart, sessionStatus, sessionEnd } from '../state/events.js';

// ~/.claude/sessions/<pid>.json is the live registry: one file per running
// Claude process, carrying sessionId, cwd and a busy|idle status.
export async function readRegistry(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const rows = [];
  for (const file of files) {
    try {
      const row = JSON.parse(await readFile(join(dir, file), 'utf8'));
      if (row && row.sessionId) rows.push(row);
    } catch {
      // Partial write or unrelated file; the next scan will pick it up.
    }
  }
  return rows;
}

export function watchRegistry(dir, onEvent, { interval = 40 } = {}) {
  const seen = new Map();
  let timer = null;
  let watcher = null;

  async function scan() {
    const rows = await readRegistry(dir);
    const live = new Set();

    for (const row of rows) {
      live.add(row.sessionId);
      const previous = seen.get(row.sessionId);

      if (previous === undefined) {
        seen.set(row.sessionId, {status:row.status,at:row.statusUpdatedAt});
        onEvent(sessionStart({
          sessionId: row.sessionId,
          cwd: row.cwd ?? null,
          projectId: null,
          title: row.name ?? null,
          at: Date.now(),
        }));
        onEvent(sessionStatus({
          sessionId: row.sessionId,
          status: row.status,
          statusUpdatedAt: row.statusUpdatedAt ?? null,
          at: Date.now(),
        }));
      } else if (previous.status !== row.status || previous.at !== row.statusUpdatedAt) {
        seen.set(row.sessionId, {status:row.status,at:row.statusUpdatedAt});
        onEvent(sessionStatus({
          sessionId: row.sessionId,
          status: row.status,
          statusUpdatedAt: row.statusUpdatedAt ?? null,
          at: Date.now(),
        }));
      }
    }

    for (const sessionId of [...seen.keys()]) {
      if (!live.has(sessionId)) {
        seen.delete(sessionId);
        onEvent(sessionEnd({ sessionId, at: Date.now() }));
      }
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scan().catch(() => {});
    }, interval);
  };

  try {
    watcher = watch(dir, schedule);
  } catch {
    // Directory may not exist yet; the poll below still covers it.
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
