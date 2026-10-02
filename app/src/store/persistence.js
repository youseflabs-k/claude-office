import { createWorld, makeAgent, PROJECTS } from '../simulation/engine.js';
import { archetypeById } from '../simulation/catalog.js';
import { DESKS, COFFEE, LOUNGE, areaAt } from '../simulation/layout.js';
import { isWalkable, nearestWalkable } from '../simulation/navigation.js';
import { LAYOUT_IDS } from '../simulation/layouts.js';
export const STORAGE_KEY = 'cozy-office:workspace:v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const number = (v, fallback, min, max) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
const text = (v, fallback, max) => typeof v === 'string' ? v.trim().slice(0, max) || fallback : fallback;
export function portableWorld(world) {
  return { version: 1, projectId: world.projectId, time: world.time, agents: world.agents.map(a => ({
    id: a.id, archetype: a.archetype, name: a.name, model: a.model, deskIndex: a.deskIndex,
    position: a.position.slice(), phase: a.phase, slotId: a.slotId, task: a.task, progress: a.progress,
    energy: a.energy, tokens: a.tokens, tasksCompleted: a.tasksCompleted, external: a.external === true
  })) };
}
/** Strict bounded import. Navigation paths and transient commands are never trusted. */
export function parseWorld(input, projectOverride = null) {
  if (!input || typeof input !== 'object' || input.version !== 1 || !Array.isArray(input.agents)) throw new Error('Not a Cozy Office v1 workspace.');
  if (input.agents.length > DESKS.length) throw new Error('This studio supports at most twelve agents.');
  const projectId = projectOverride ?? input.projectId;
  if (!PROJECTS.some(p => p.id === projectId)) throw new Error('Unknown project.');
  const world = createWorld(projectId); world.agents = []; world.events = [];
  world.time = number(input.time, 0, 0, 1e9);
  const desks = new Set(), ids = new Set(), slots = new Set();
  for (const raw of input.agents) {
    if (!raw || !archetypeById(raw.archetype)) throw new Error('The workspace contains an unknown character.');
    const index = raw.deskIndex;
    if (!Number.isInteger(index) || index < 0 || index >= DESKS.length || desks.has(index)) throw new Error('Each agent must have a different valid desk.');
    const id = text(raw.id, `imported-${index}`, 100);
    if (ids.has(id)) throw new Error('Agent identifiers must be unique.');
    desks.add(index); ids.add(id);
    const a = makeAgent(raw.archetype, index, id);
    Object.assign(a, {
      name: text(raw.name, a.name, 48), model: text(raw.model, 'Local simulation', 48), task: text(raw.task, a.task, 180),
      external: raw.external === true, progress: number(raw.progress, 0, 0, 100), energy: number(raw.energy, 90, 0, 100),
      tokens: number(raw.tokens, 0, 0, 1e12), tasksCompleted: Math.floor(number(raw.tasksCompleted, 0, 0, 1e9))
    });
    let slot = null;
    if (raw.phase === 'working') slot = DESKS[index];
    if (raw.phase === 'coffee') slot = COFFEE.find(s => s.id === raw.slotId && !slots.has(s.id)) ?? COFFEE.find(s => !slots.has(s.id));
    if (raw.phase === 'resting') slot = LOUNGE.find(s => s.id === raw.slotId && !slots.has(s.id)) ?? LOUNGE.find(s => !slots.has(s.id));
    if (slot) {
      a.phase = raw.phase; a.position = slot.seat.slice(); a.slotId = slot.id; a.facing = slot.facing; a.area = slot.area; slots.add(slot.id);
    } else {
      a.phase = 'idle';
      const p = raw.position;
      if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) a.position = isWalkable(p) ? p.slice() : nearestWalkable(p) ?? DESKS[index].entry.slice();
      a.area = areaAt(a.position);
    }
    world.agents.push(a);
  }
  return world;
}
export function loadSession(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw || raw.length > 2_000_000) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return null;
    const worlds = {};
    for (const project of PROJECTS) if (parsed.worlds?.[project.id]) worlds[project.id] = parseWorld(parsed.worlds[project.id], project.id);
    // Workspaces are discovered after this runs, so there may be none yet.
    // Reading PROJECTS[0].id here threw, and the catch below swallowed it —
    // which quietly discarded every saved setting, not just the project.
    const projectId = PROJECTS.some(p => p.id === parsed.projectId)
      ? parsed.projectId : PROJECTS[0]?.id ?? parsed.projectId ?? null;
    return { worlds, projectId, settings: {
      theme: parsed.settings?.theme === 'night' ? 'night' : 'sunset',
      quality: ['low', 'balanced', 'high'].includes(parsed.settings?.quality) ? parsed.settings.quality : 'balanced',
      labels: parsed.settings?.labels !== false,
      sounds: parsed.settings?.sounds !== false,
      autonomous: parsed.settings?.autonomous === true,
      speed: [0.5, 1, 2].includes(parsed.settings?.speed) ? parsed.settings.speed : 1,
      layout: LAYOUT_IDS.includes(parsed.settings?.layout) ? parsed.settings.layout : 'world'
    } };
  } catch { return null; }
}
export function saveSession(state, storage) {
  try {
    storage ??= globalThis.localStorage;
    const worlds = { ...state.worlds, [state.world.projectId]: state.world };
    const snapshot = { version: 1, projectId: state.world.projectId, settings: state.settings,
      worlds: Object.fromEntries(Object.entries(worlds).map(([id, w]) => [id, portableWorld(w)])) };
    if (!storage?.setItem) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}
