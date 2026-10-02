import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { probeSession } from './probe.js';

// A project dir name like "-Users-me-Documents-My-App" maps both "/" and " "
// to "-", so it cannot be decoded back to a path. The real path is read from a
// session's cwd instead; the slug is only a fallback display name.
export async function discoverProjects(projectsDir) {
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dir = join(projectsDir, entry.name);
    let files = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      files = [];
    }

    let realPath = null;
    let lastActiveAt = null;

    if (files.length > 0) {
      const stamped = await Promise.all(
        files.map(async (f) => ({ f, mtime: (await stat(join(dir, f))).mtimeMs })),
      );
      stamped.sort((a, b) => b.mtime - a.mtime);
      lastActiveAt = new Date(stamped[0].mtime).toISOString();
      try {
        realPath = (await probeSession(join(dir, stamped[0].f))).cwd ?? null;
      } catch {
        realPath = null;
      }
    }

    found.push({
      claudeSlug: entry.name,
      dir,
      realPath,
      sessionCount: files.length,
      lastActiveAt,
    });
  }

  found.sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''));
  return found;
}
