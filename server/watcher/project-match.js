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

  return candidates.find((p) => {
    // A prefix match has to stop at a path separator, or /app would claim
    // /app-creator.
    const root = p.realPath.replace(/\/+$/, '');
    return cwd === root || cwd.startsWith(`${root}/`);
  }) ?? null;
}
