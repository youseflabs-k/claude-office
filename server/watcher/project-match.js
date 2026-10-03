import { relative, isAbsolute } from 'node:path';

/** Which imported project a working directory belongs to.
 *
 * Sessions arrive from the registry carrying a cwd and nothing else, so this
 * is the only way to place one the index has never seen. Longest real path
 * first, so a project checked out inside another one wins over its parent
 * rather than losing to whichever happened to be listed earlier.
 */
export function resolveProject(cwd, projects) {
  if (typeof cwd !== 'string' || !cwd) return null;

  const candidates = Object.values(projects ?? {})
    .filter((p) => p && typeof p.realPath === 'string' && p.realPath && p.dir)
    .sort((a, b) => b.realPath.length - a.realPath.length);

  return candidates.find((p) => inside(p.realPath, cwd)) ?? null;
}

// Containment, asked of node:path rather than of string prefixes. This gets
// three things right that a startsWith cannot: separators on Windows, its
// case-insensitive comparison, and the fact that /app must not claim
// /app-creator.
function inside(root, cwd) {
  let rel;
  try {
    rel = relative(root, cwd);
  } catch {
    return false;
  }
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
