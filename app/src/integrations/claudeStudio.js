import { PROJECTS, DEMO_PROJECTS, setProjects } from '../simulation/engine.js';
import { store } from '../store/store.js';
import { getProjects, getRoom, connect } from './claude.js';

// Keeps the studio pointed at the real workspace: the imported Claude projects
// become the workspace list, and whichever one is open is kept in step with
// the sessions running inside it.

export async function loadWorkspaces() {
  const data = await getProjects();
  const imported = data.imported ?? [];

  setProjects(imported.map((p) => ({
    id: p.id,
    name: p.displayName,
    description: p.realPath ?? p.claudeSlug ?? '',
  })));

  store.setWorkspaces({
    projects: imported,
    folders: Object.values(data.folders ?? {}),
    // Projects found under ~/.claude that have not been imported yet.
    available: (data.available ?? []).filter(
      (a) => a.provider === 'codex' || !imported.some((p) => p.claudeSlug === a.claudeSlug),
    ),
  });

  return PROJECTS;
}

export async function startClaudeStudio() {
  let stopped = false, inFlight = false, pending = false, snapshotVersion = 0;

  const refresh = async () => {
    if (inFlight) { pending = true; return; }
    const projectId = store.getSnapshot().world.projectId;
    if (stopped || !projectId) return;
    inFlight = true;
    const version = snapshotVersion;
    try {
      const room = await getRoom(projectId);
      if (!stopped && version === snapshotVersion && store.getSnapshot().world.projectId === projectId) {
        store.claudeSync(room, projectId); store.setConnection('live');
      }
    } catch { if (!stopped) store.setConnection('down'); }
    finally { inFlight = false; if (pending && !stopped) { pending = false; refresh(); } }
  };

  try {
    await loadWorkspaces();
  } catch {
    // No panel server. Fall back to the demo workspaces so the studio still
    // shows something, and say plainly that it is not live.
    setProjects(DEMO_PROJECTS);
    store.setWorkspaces({ projects: [], folders: [], available: [] });
    store.useDemoWorkspace(PROJECTS[0].id);
    store.setConnection('down');
    return () => {};
  }

  const open = store.getSnapshot().world.projectId;
  if (!PROJECTS.some((p) => p.id === open) && PROJECTS[0]) store.project(PROJECTS[0].id);
  await refresh();

  const close = connect({ onChange: event => {
    if (event.room) {
      snapshotVersion++;
      if (event.projectId === store.getSnapshot().world.projectId) { store.claudeSync(event.room, event.projectId); store.setConnection('live'); }
    } else refresh();
  }, onError: () => store.setConnection('down') });
  const fallback = setInterval(refresh, 1500);

  // Switching workspace needs a fresh read; the stream only says "something
  // changed", not "you are now looking at a different project".
  let last = store.getSnapshot().world.projectId;
  const unsubscribe = store.subscribe(() => {
    const now = store.getSnapshot().world.projectId;
    if (now !== last) { last = now; refresh(); }
  });

  return () => { stopped = true; clearInterval(fallback); close(); unsubscribe(); };
}
