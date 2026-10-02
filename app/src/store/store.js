import { createWorld, createLiveWorld, PROJECTS, commandWorld, stepWorld, hireAgent, meetingWorld, pushEvent, makeAgent } from '../simulation/engine.js';
import { CHARACTERS } from '../simulation/catalog.js';
import { castRoom, labelRoom, taskFor, commandFor } from '../integrations/claude.js';
import { DESKS, setLayout } from '../simulation/layout.js';
import { LAYOUT_IDS } from '../simulation/layouts.js';
import { loadSession, saveSession, portableWorld, parseWorld } from './persistence.js';
const saved = typeof window !== 'undefined' ? loadSession() : null;
// The arrangement decides where the desks are, so it has to be in place
// before any world is created from them.
if (saved?.settings?.layout) setLayout(saved.settings.layout);
// Workspaces are discovered after this module loads, so there may not be one
// yet. The studio opens empty and the bridge switches to a real project.
const projectId = saved?.projectId ?? PROJECTS[0]?.id ?? null;
const worlds = saved?.worlds ?? {};
const initial = worlds[projectId] ?? createLiveWorld(projectId);
let state = {
  world: initial, worlds, selectedId: initial.agents[0]?.id ?? null,
  settings: { labels: true, sounds: true, autonomous: false, speed: 1, quality: 'balanced', theme: 'sunset', layout: 'world', ...saved?.settings },
  paused: false, view: 'studio', tool: 'select', panel: 'agents', search: '',
  modal: null, toast: null, ready: false, loadProgress: 0, sceneError: null,
  cameraRequest: { key: 0, kind: 'view', view: 'studio' }, zoom: 100,
  activeRoom: 'all', sidebarOpen: false,
  // The real workspace: imported Claude projects, their folders, and what is
  // on disk but not imported yet.
  workspaces: { projects: [], folders: [], available: [] },
  connection: 'connecting', watching: null, detailsOpen: false
};
const listeners = new Set();
function set(patch) { state = { ...state, ...patch }; for (const fn of listeners) fn(); }
let toastTimer;
function notify(message, type = 'info') {
  clearTimeout(toastTimer); set({ toast: { message, type } });
  toastTimer = setTimeout(() => set({ toast: null }), 4300);
}
function emitCommand(id, command, point = null) {
  if (typeof window === 'undefined') return;
  const agent = state.world.agents.find(a => a.id === id);
  window.dispatchEvent(new CustomEvent('cozy-office:command', {
    detail: { agentId: id, command, point, deskIndex: agent?.deskIndex, projectId: state.world.projectId }
  }));
}
function accept(result, success) {
  if (result.error) { notify(result.error, 'error'); return false; }
  set({ world: result.world }); if (success) notify(success, 'success'); return true;
}
export const store = {
  subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  getSnapshot: () => state,
  select(id) { if (id == null || state.world.agents.some(a => a.id === id)) set({ selectedId: id, detailsOpen: id != null, watching: null }); },
  notify,
  setUI(patch) { set(patch); },
  setWorkspaces(workspaces) { set({ workspaces }); },

  /** Rearrange the studio.
   *
   * Desks, seats and obstacles all move, so everybody is sent back to their
   * own desk under the new plan rather than being left standing on furniture
   * that is no longer there.
   */
  layout(id) {
    if (!LAYOUT_IDS.includes(id) || state.settings.layout === id) return;
    setLayout(id);
    let world = structuredClone(state.world);
    for (const agent of world.agents) {
      agent.position = DESKS[agent.deskIndex].entry.slice();
      agent.path = []; agent.goal = null; agent.transition = null;
      agent.phase = 'idle'; agent.phaseTime = 0; agent.slotId = null; agent.area = 'office';
    }
    for (const agent of world.agents) {
      const result = commandWorld(world, agent.id, 'work');
      if (!result.error) world = result.world;
    }
    set({ settings: { ...state.settings, layout: id }, world });
    store.camera('view', 'studio');
    notify('The studio has been rearranged.', 'success');
  },
  /** Open the transcript for an agent, if it is one of ours. */
  watch(id = state.selectedId) {
    const agent = state.world.agents.find(a => a.id === id);
    if (agent?.sessionId) set({ watching: agent.id });
  },
  unwatch() { set({ watching: null }); },
  /** No panel server: show the pack's own simulated studio instead of nothing. */
  useDemoWorkspace(projectId) {
    const world = createWorld(projectId);
    set({ world, selectedId: world.agents[0]?.id ?? null });
  },
  setConnection(connection) { set({ connection }); },
  setSetting(key, value) {
    const checks = {
      sounds: v => typeof v === 'boolean', labels: v => typeof v === 'boolean', autonomous: v => typeof v === 'boolean', speed: v => [0.5, 1, 2].includes(v),
      quality: v => ['low', 'balanced', 'high'].includes(v), theme: v => ['sunset', 'night'].includes(v),
      layout: v => LAYOUT_IDS.includes(v)
    };
    if (!checks[key]?.(value)) return;
    if (key === 'layout') return store.layout(value);
    set({ settings: { ...state.settings, [key]: value } });
  },
  pause() { set({ paused: !state.paused }); },
  command(command, point, id = state.selectedId, { emit = true } = {}) {
    const accepted = accept(commandWorld(state.world, id, command, point));
    if (accepted && emit) emitCommand(id, command, point);
    return accepted;
  },
  assignDesk(index) {
    if (!state.selectedId) return notify('Select an agent before choosing a desk.');
    const occupant = state.world.agents.find(a => a.deskIndex === index);
    if (occupant && occupant.id !== state.selectedId) { store.select(occupant.id); return; }
    if (!DESKS[index]) return;
    const world = structuredClone(state.world); world.agents.find(a => a.id === state.selectedId).deskIndex = index;
    if (accept(commandWorld(world, state.selectedId, 'work'))) emitCommand(state.selectedId, 'work');
  },
  applyTelemetry(event) {
    const world = structuredClone(state.world), a = world.agents.find(a => a.id === event.agentId);
    if (!a) return;
    a.external = true;
    for (const [key, max] of [['tokens', 1e12], ['progress', 100], ['energy', 100], ['tasksCompleted', 1e9]]) {
      if (typeof event[key] === 'number' && Number.isFinite(event[key])) {
        const value = Math.max(0, Math.min(max, event[key]));
        a[key] = key === 'tasksCompleted' ? Math.floor(value) : value;
      }
    }
    if (typeof event.task === 'string') a.task = event.task.slice(0, 180);
    if (typeof event.model === 'string') a.model = event.model.slice(0, 48);
    set({ world });
  },
  useLocalSimulation(id = state.selectedId) {
    const world = structuredClone(state.world), agent = world.agents.find(a => a.id === id);
    if (!agent) return;
    agent.external = false; agent.model = 'Local simulation'; set({ world });
    notify('Local simulation enabled. Disconnect any event stream to keep this mode.');
  },
  updateAgent(patch, id = state.selectedId) {
    const world = structuredClone(state.world), agent = world.agents.find(a => a.id === id); if (!agent) return;
    if (typeof patch.name === 'string' && patch.name.trim()) agent.name = patch.name.trim().slice(0, 48);
    if (typeof patch.model === 'string') agent.model = patch.model.trim().slice(0, 48) || 'Local simulation';
    if (typeof patch.task === 'string') { agent.task = patch.task.trim().slice(0, 180) || 'Explore the next task'; agent.progress = 0; }
    set({ world });
  },
  say(text, id = state.selectedId) {
    if (!text?.trim()) return;
    const world = structuredClone(state.world), a = world.agents.find(a => a.id === id); if (!a) return;
    a.speech = text.trim().slice(0, 120); a.speechUntil = world.time + 10; set({ world });
  },
  meet(otherId, text) {
    const selected = state.selectedId;
    const accepted = accept(meetingWorld(state.world, selected, otherId, text), 'Coffee chat arranged.');
    if (accepted) { emitCommand(selected, 'coffee'); emitCommand(otherId, 'coffee'); }
    return accepted;
  },
  hire(archetype) {
    const result = hireAgent(state.world, archetype);
    if (accept(result, 'Your new teammate is on the way.')) { set({ selectedId: result.agentId, modal: null }); emitCommand(result.agentId, 'work'); }
  },
  remove(id) {
    const world = structuredClone(state.world), agent = world.agents.find(a => a.id === id); if (!agent) return;
    world.agents = world.agents.filter(a => a.id !== id);
    pushEvent(world, `${agent.name} left the studio`, 'Their desk is available.', 'info');
    set({ world, selectedId: state.selectedId === id ? world.agents[0]?.id ?? null : state.selectedId, modal: null });
    notify('Agent removed. Their desk is now available.');
  },
  project(id) {
    if (!PROJECTS.some(p => p.id === id) || state.world.projectId === id) return;
    const worlds = { ...state.worlds, [state.world.projectId]: state.world };
    // A Claude-backed studio starts empty and is filled by the sync.
    const world = worlds[id] ?? createLiveWorld(id);
    set({ worlds, world, selectedId: world.agents[0]?.id ?? null, sidebarOpen: false, activeRoom: 'all', search: '' });
    store.camera('view', 'studio');
  },
  camera(kind, value) {
    const request = { key: state.cameraRequest.key + 1, kind };
    if (kind === 'view') { request.view = value; set({ view: value }); }
    if (kind === 'focus') request.agentId = value ?? state.selectedId;
    if (kind === 'zoom') request.amount = value;
    set({ cameraRequest: request });
  },
  reset() {
    const world = createWorld(state.world.projectId); set({ world, selectedId: world.agents[0]?.id ?? null, modal: null });
    store.camera('view', 'studio'); notify('This studio has been reset. Other projects were kept.');
  },
  importJSON(text) {
    try {
      if (text.length > 1_000_000) throw new Error('Import files must be smaller than 1 MB.');
      const world = parseWorld(JSON.parse(text), state.world.projectId);
      pushEvent(world, 'Workspace imported', 'Transient navigation was cleared safely.', 'success');
      set({ world, selectedId: world.agents[0]?.id ?? null, modal: null }); notify('Workspace imported.', 'success');
      return true;
    } catch (e) { notify(e.message || 'Could not import the workspace.', 'error'); return false; }
  },
  exportJSON() { return JSON.stringify(portableWorld(state.world), null, 2); },
  tick(dt) { if (!state.paused && state.ready) set({ world: stepWorld(state.world, dt * state.settings.speed, state.settings.autonomous) }); },

  /** Reconcile this studio with the sessions and subagents actually running.
   *
   * The server owns the question of who exists and what they are doing; the
   * simulation owns their bodies. So this adds and removes people and sets
   * their telemetry, then issues one command each and lets the engine walk
   * them there. Repeating a command is a no-op in the engine, which is what
   * keeps a status arriving every second from restarting a sit-down.
   */
  claudeSync(room, projectId) {
    if (!room || state.world.projectId !== projectId) return;
    const roles = CHARACTERS.map(c => c.id);
    // Oldest first, so people arrive in the order they actually started and a
    // repaint never reorders the room.
    const live = [...(room.desks ?? []).filter(Boolean), ...(room.porch ?? [])]
      .sort((a, b) => (a.firstSeenAt ?? 0) - (b.firstSeenAt ?? 0)
        || String(a.id).localeCompare(String(b.id)));
    const cast = castRoom(live, roles);
    const names = labelRoom(live);

    let world = structuredClone(state.world);
    world.live = true;
    const present = new Set(live.map(a => a.id));

    for (const gone of world.agents.filter(a => !present.has(a.id))) {
      pushEvent(world, `${gone.name} finished`, 'Their desk is free again.', 'info');
    }
    world.agents = world.agents.filter(a => present.has(a.id));

    const completions = [], attentions = [];
    const capped = live.slice(0, DESKS.length);
    for (const agent of capped) {
      let person = world.agents.find(a => a.id === agent.id);
      if (!person) {
        const taken = new Set(world.agents.map(a => a.deskIndex));
        const deskIndex = DESKS.findIndex(d => !taken.has(d.index));
        if (deskIndex < 0) continue;
        person = makeAgent(cast.get(agent.id), deskIndex, agent.id);
        person.position = [-2.5, 4.8];   // in through the door, like a new hire
        world.agents.push(person);
        pushEvent(world, `${names.get(agent.id)} started`, DESKS[deskIndex].label, 'success', agent.id);
      }
      // Externally controlled: the local simulation must not invent progress
      // for somebody whose real token count we know.
      person.external = true;
      person.provider = agent.provider ?? 'claude';
      person.archetype = cast.get(agent.id) ?? person.archetype;
      // Which transcript belongs to this person.
      person.sessionId = agent.sessionId;
      person.isSession = Boolean(agent.isSession);
      person.name = names.get(agent.id);
      person.task = taskFor(agent);
      person.model = agent.model ?? 'inherited';
      person.tokens = Math.max(0, agent.tokens ?? 0);

      // Only a confirmed idle/completion allows a break. Tool gaps still
      // belong to an active turn (including API backoff and background work).
      const completion = agent.completedAt ?? agent.doneAt;
      if (completion && person.completion !== completion && person.busy) {
        person.speech = '✓ Task done'; person.speechUntil = world.time + 12;
        completions.push({ agentId:person.id, at:completion });
        pushEvent(world, `${person.name} · task done`, '', 'success', person.id);
      }
      person.completion = completion;
      const busy = Boolean(agent.tool || agent.active) && !agent.waiting && !agent.needsYou && agent.status !== 'done';
      person.changed = person.busy !== busy || person.needsYou !== Boolean(agent.needsYou);
      person.busy = busy;
      if (agent.needsYou && !person.needsYou) attentions.push({agentId:person.id,at:agent.attentionAt});
      person.needsYou = Boolean(agent.needsYou);
      person.attentionText = agent.attentionText;
      person.freeToRoam = !busy && !person.needsYou;
    }

    // Commands last, against the world that now contains everybody.
    //
    // Only steer somebody who has something to do, or who has just stopped
    // having something to do. Commanding an idle agent on every refresh would
    // march them back to their desk the moment they wandered off.
    for (const agent of capped) {
      const person = world.agents.find(a => a.id === agent.id);
      if (!person || (!person.busy && !person.changed && !person.needsYou)) continue;
      const command = person.needsYou ? 'sit' : commandFor(agent);
      if (person.needsYou) {
        person.speech = agent.attentionText ? `✋ ${agent.attentionText}` : '✋ Needs you — waiting for your input'; person.speechUntil = Infinity;
      } else if (person.speechUntil === Infinity) { person.speech = ''; person.speechUntil = 0; }
      // Telemetry is immediate; bodies always follow navigation and sit/stand
      // transitions. Repeated syncs preserve an existing route.
      const result = commandWorld(world, agent.id, command);
      // A full lounge or coffee bar rejects the move; keep the person where
      // they are rather than surfacing a toast for something nobody asked for.
      if (!result.error) world = result.world;
    }

    const selectedId = world.agents.some(a => a.id === state.selectedId)
      ? state.selectedId : world.agents[0]?.id ?? null;
    set({ world, selectedId, ...(attentions.length ? {attentionNotice:{key:(state.attentionNotice?.key ?? 0)+1,attentions}} : {}), ...(completions.length ? { completionNotice: { key:(state.completionNotice?.key ?? 0) + 1, completions } } : {}) });

    if (live.length > DESKS.length) {
      notify(`${live.length - DESKS.length} more agent(s) are running than this studio has desks.`);
    }
  },
  flush() { return saveSession(state); }
};
/** Separate lifecycle avoids timers surviving React StrictMode unmounts. */
export function startSimulation() {
  let previous = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), dt = Math.min((now - previous) / 1000, 0.125); previous = now;
    if (!document.hidden) store.tick(dt);
  }, 33);
  const save = setInterval(() => store.flush(), 2500);
  const beforeUnload = () => store.flush(); window.addEventListener('beforeunload', beforeUnload);
  return () => { clearInterval(timer); clearInterval(save); window.removeEventListener('beforeunload', beforeUnload); store.flush(); };
}
