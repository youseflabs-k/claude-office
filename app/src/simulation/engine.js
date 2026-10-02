import { CHARACTERS, archetypeById } from './catalog.js';
import { DESKS, LOUNGE, COFFEE, GARDEN, getSlot, areaAt } from './layout.js';
import { distance, findPath, isWalkable, lerpPoint, wanderTarget } from './navigation.js';

// Workspaces are the Claude projects you have imported, so this list is filled
// in at startup rather than fixed. It is replaced in place because the binding
// is imported by value across the app.
export const PROJECTS = [];

// What the pack ships with. Used when the panel server is not running, so the
// studio still demonstrates itself offline, and as the fixture for the tests.
export const DEMO_PROJECTS = [
  { id: 'app-creator', name: 'App Creator', color: '#3ddc97', description: 'Building the next good thing.' },
  { id: 'hakeemrx', name: 'hakeemrx', color: '#a58af5', description: 'A calmer healthcare workflow.' },
  { id: 'qasioun-motors', name: 'qasioun-motors', color: '#58a6ff', description: 'Tools that keep things moving.' },
  { id: 'world-cup-26', name: 'world-cup-26', color: '#ffd166', description: 'A home for every match.' }
];

const PALETTE = ['#3ddc97', '#a58af5', '#58a6ff', '#ffd166', '#f798b6', '#7ad4c8'];

export function setProjects(list) {
  PROJECTS.length = 0;
  list.forEach((p, i) => PROJECTS.push({
    color: PALETTE[i % PALETTE.length], description: p.description ?? '', ...p,
  }));
  return PROJECTS;
}
export const PHASE_LABELS = {
  idle: 'Ready', working: 'Working', walking: 'On the move', coffee: 'Coffee break',
  resting: 'Recharging', celebrating: 'Celebrating', 'sitting-down': 'Sitting down', 'standing-up': 'Standing up'
};
export const PHASE_COLORS = {
  idle: '#79819f', working: '#3ddc97', walking: '#58a6ff', coffee: '#ffd166',
  resting: '#b4a2f5', celebrating: '#f798b6', 'sitting-down': '#58a6ff', 'standing-up': '#58a6ff'
};
const TASKS = ['Review the authentication flow', 'Polish the onboarding screens', 'Build the session API', 'Run the integration suite'];
const copy = obj => structuredClone(obj);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function uid() { return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
export function makeAgent(archetype, deskIndex = 0, id = uid()) {
  const c = archetypeById(archetype) ?? CHARACTERS[0];
  return {
    id, archetype: c.id, name: c.id, model: 'Local simulation', color: `#${c.color}`,
    deskIndex, position: DESKS[deskIndex].entry.slice(), facing: Math.PI,
    phase: 'idle', phaseTime: 0, area: 'office', slotId: null,
    goal: null, path: [], transition: null, speech: '', speechUntil: 0,
    task: TASKS[deskIndex % TASKS.length], progress: 0, tokens: 0,
    energy: 90, tasksCompleted: 0, waitTime: 0
  };
}
export function pushEvent(world, title, detail = '', kind = 'info', agentId = null) {
  world.events.unshift({ id: uid(), title, detail, kind, agentId, time: world.time });
  world.events = world.events.slice(0, 80);
}
// A studio backed by real sessions starts with nobody in it. The sync adds
// people as Claude actually starts them, and removes them when they stop.
export function createLiveWorld(projectId) {
  return { version: 1, projectId, time: 0, agents: [], events: [], live: true };
}

export function createWorld(projectId = PROJECTS[0]?.id) {
  const world = { version: 1, projectId, time: 0, agents: [], events: [] };
  const offset = PROJECTS.findIndex(p => p.id === projectId);
  const kinds = offset <= 0 ? CHARACTERS.slice(0, 4) : CHARACTERS.slice(4 + (offset - 1) * 3, 7 + (offset - 1) * 3);
  world.agents = kinds.map((c, i) => makeAgent(c.id, i, `${projectId}-${i}`));
  world.agents.forEach((a, i) => {
    const slot = i === 2 ? COFFEE[0] : i === 3 ? LOUNGE[1] : DESKS[i];
    a.position = slot.seat.slice(); a.facing = slot.facing; a.slotId = slot.id; a.area = slot.area;
    a.phase = i === 2 ? 'coffee' : i === 3 ? 'resting' : 'working';
    a.progress = i < 2 ? 31 + i * 29 : 0; a.tokens = i < 2 ? 2142 + i * 861 : 0; a.energy = 86 - i * 9;
  });
  pushEvent(world, 'Your studio is ready', 'Select an agent to give them a direction.', 'info');
  pushEvent(world, 'The team is settling in', 'Two at work. Room for a little recharge.', 'success');
  return world;
}
function occupiedSlots(world, exceptId) {
  return new Set(world.agents.filter(a => a.id !== exceptId).flatMap(a => [a.slotId, a.goal?.slotId]).filter(Boolean));
}
export function availableSlot(world, type, agentId) {
  const slots = type === 'garden' ? GARDEN : type === 'rest' ? LOUNGE : COFFEE;
  const occupied = occupiedSlots(world, agentId);
  return slots.find(s => !occupied.has(s.id));
}
function arrive(world, agent) {
  const goal = agent.goal;
  if (!goal) { agent.phase = 'idle'; return; }
  agent.path = []; agent.phaseTime = 0; agent.facing = goal.facing;
  if (goal.activity === 'work' || goal.activity === 'rest' || goal.activity === 'garden' || goal.activity === 'sit') {
    agent.phase = 'sitting-down';
    agent.transition = { from: agent.position.slice(), to: goal.seat.slice() };
  } else {
    agent.phase = goal.activity === 'coffee' ? 'coffee' : goal.activity === 'celebrate' ? 'celebrating' : 'idle';
    agent.position = goal.seat.slice(); agent.slotId = goal.slotId ?? null;
    agent.goal = null; agent.transition = null; agent.area = areaAt(agent.position);
    if (agent.phase !== 'idle') pushEvent(world, `${agent.name} · ${PHASE_LABELS[agent.phase].toLowerCase()}`, '', 'info', agent.id);
  }
}
/** Commands return a new world, never mutate the caller's state. */
export function commandWorld(original, agentId, command, point = null, options = {}) {
  const world = copy(original), agent = world.agents.find(a => a.id === agentId);
  if (!agent) return { world: original, error: 'Select an agent first.' };
  if (!['work', 'rest', 'garden', 'sit', 'coffee', 'move', 'idle', 'celebrate'].includes(command)) return { world: original, error: 'Unknown command.' };
  if (!options.slotId && ((command === 'work' && agent.phase === 'working' && agent.slotId === DESKS[agent.deskIndex].id) ||
    (command === 'coffee' && agent.phase === 'coffee') || (command === 'rest' && agent.phase === 'resting')))
    return { world: original, error: null };
  // Repeated backend status updates must not restart a sit/stand transition.
  if (agent.goal?.activity === command &&
      (command !== 'work' || agent.goal.slotId === DESKS[agent.deskIndex].id) &&
      (!options.slotId || options.slotId === agent.goal.slotId) &&
      (command !== 'move' || (isWalkable(point) && distance(point, agent.goal.entry) < 0.02)))
    return { world: original, error: null };
  let slot = null;
  if (command === 'work' || command === 'sit') slot = DESKS[agent.deskIndex];
  if (command === 'rest' || command === 'garden' || command === 'coffee') {
    slot = options.slotId ? getSlot(options.slotId) : availableSlot(world, command, agentId);
    const allowed = command === 'garden' ? GARDEN : command === 'rest' ? LOUNGE : COFFEE;
    if (!slot || !allowed.some(s => s.id === slot.id) || occupiedSlots(world, agentId).has(slot.id))
      return { world: original, error: command === 'rest' ? 'The lounge is full. Try a coffee break.' : 'All coffee spots are taken. Try the lounge.' };
  }
  // Changing from working to waiting (or back) at the same desk is seated.
  if (['work','sit'].includes(command) && agent.slotId === slot.id && ['working','resting'].includes(agent.phase)) {
    agent.phase = command === 'work' ? 'working' : 'resting';
    agent.phaseTime = 0; agent.goal = null; agent.path = []; agent.transition = null; agent.leisure = null;
    return { world, error:null };
  }
  const seated = ['working', 'resting', 'sitting-down', 'standing-up'].includes(agent.phase);
  const oldSlot = getSlot(agent.slotId ?? agent.goal?.slotId);
  const origin = seated && oldSlot ? oldSlot.entry.slice() : agent.position.slice();
  const target = slot ? slot.entry.slice() : command === 'move' ? point : origin;
  if (!isWalkable(target)) return { world: original, error: 'Choose an open spot on the floor.' };
  if (command === 'move' && world.agents.some(a => a.id !== agentId && distance(a.position, target) < 0.60))
    return { world: original, error: 'That spot is occupied by another agent.' };
  const path = findPath(origin, target);
  if (!path) return { world: original, error: 'There is no clear route to that spot.' };
  if (command === 'work') agent.leisure = null;
  agent.goal = { activity: command, slotId: slot?.id ?? null, entry: target, seat: slot?.seat.slice() ?? target,
    facing: slot?.facing ?? agent.facing };
  agent.path = path; agent.waitTime = 0; agent.phaseTime = 0;
  if (seated && oldSlot) {
    agent.phase = 'standing-up'; agent.transition = { from: agent.position.slice(), to: origin };
  } else {
    agent.phase = 'walking'; agent.slotId = null; agent.transition = null;
    if (!path.length) arrive(world, agent);
  }
  return { world, error: null };
}
// Who is free to wander off.
//
// `external` means "the telemetry is real, do not invent it" — it is not the
// same question as "are they busy". A live agent that Claude says is merely
// thinking has nothing to do, so it may stretch its legs; one that is running
// a tool stays at its desk. Agents from the local simulation follow the
// studio's autonomy setting as before.
const canRoam = (agent, autonomous) =>
  (agent.external ? agent.freeToRoam === true : autonomous);

// A live idle agent breaks sooner than the simulation's slow drift, or you
// would almost never catch anybody away from their desk.
const dwell = (agent) => (agent.freeToRoam ? 34 + agent.deskIndex * 3 : 75 + agent.deskIndex * 5);

// What an idle person does next. Two of three breaks are a proper trip to the
// lounge or the coffee bar; the third is just getting up and moving about,
// which is what makes a room look occupied rather than choreographed.
//
// Keyed on the desk plus how many breaks that person has already taken, so a
// given studio behaves the same way twice and nobody repeats themselves. The
// order starts at the lounge because a first break from a tired agent is a
// rest, which is the cycle the engine tests check.
function breakFor(agent, world) {
  if (agent.external && agent.freeToRoam) {
    const choice = (agent.deskIndex + (agent.breaks ?? 0)) % 6;
    agent.leisure = ['rest','coffee','reading','garden','walking','desk-rest'][choice];
    if (choice === 5) return [agent.id, 'sit'];
    if (choice === 3) {
      return [agent.id, availableSlot(world, 'garden', agent.id) ? 'garden' : 'move', [0,20]];
    }
    if (choice === 4) {
      const stops = [[-3,13],[0,21],[9,19],[11,12]];
      return [agent.id, 'move', stops[(agent.deskIndex + (agent.breaks ?? 0)) % stops.length]];
    }
    return [agent.id, choice === 1 ? 'coffee' : 'rest'];
  }
  const choice = (agent.deskIndex + (agent.breaks ?? 0)) % 3;
  if (choice === 0) return [agent.id, 'rest'];
  if (choice === 1) return [agent.id, 'coffee'];
  const point = wanderTarget(agent.position);
  return point ? [agent.id, 'move', point] : [agent.id, 'coffee'];
}

export function stepWorld(original, dt, autonomous = false) {
  if (!Number.isFinite(dt) || dt <= 0) return original;
  // Clamping avoids teleporting after suspended tabs. The runner handles timescale.
  dt = Math.min(dt, 0.25);
  const world = copy(original); world.time += dt;
  const intents = [];
  for (const a of world.agents) {
    a.phaseTime += dt;
    if (a.external && a.freeToRoam && ['coffee', 'resting'].includes(a.phase) && a.leisure !== 'reading' && !a.speech && world.time > (a.nextChatAt ?? 0)) {
      const partner = world.agents.find(b => b.id !== a.id && b.external && b.freeToRoam && ['coffee', 'resting'].includes(b.phase) && b.leisure !== 'reading' && distance(a.position, b.position) < 2.6);
      a.nextChatAt = world.time + 22;
      if (partner) {
        if (a.phase === 'coffee') a.facing = Math.atan2(partner.position[0] - a.position[0], partner.position[1] - a.position[1]);
        if (a.phase === 'coffee') partner.facing = Math.atan2(a.position[0] - partner.position[0], a.position[1] - partner.position[1]);
        a.speech = 'Care for a coffee?'; a.speechUntil = world.time + 5;
        partner.speech = 'A little break sounds good.'; partner.speechUntil = world.time + 7; partner.nextChatAt = world.time + 22;
      }
    }
    if (a.speech && world.time >= a.speechUntil) a.speech = '';
    if (a.external && a.freeToRoam && a.goal?.activity === 'work') { intents.push(breakFor(a, world)); continue; }
    if (a.phase === 'walking') {
      let budget = 1.75 * dt;
      while (budget > 0 && a.path.length) {
        const next = a.path[0], d = distance(a.position, next);
        const candidate = d < budget ? next.slice() : lerpPoint(a.position, next, budget / d);
        // Soft priority yielding reduces overlap at shared intersections. Stationary
        // agents are not a global navigation lock; furniture is handled by A*.
        const blocker = world.agents.find(b => b.id !== a.id && b.phase === 'walking' &&
          b.id < a.id && distance(b.position, candidate) < 0.52 && distance(a.position, b.position) > 0.30);
        if (blocker && a.waitTime < 1.4) { a.waitTime += dt; break; }
        a.waitTime = 0;
        if (d > 0.001) a.facing = Math.atan2(next[0] - a.position[0], next[1] - a.position[1]);
        a.position = candidate; budget -= d;
        if (d <= 1.75 * dt + 0.001 && distance(a.position, next) < 0.02) a.path.shift();
        else break;
      }
      a.area = areaAt(a.position);
      if (!a.path.length) arrive(world, a);
    } else if (a.phase === 'standing-up' || a.phase === 'sitting-down') {
      const t = clamp(a.phaseTime / 1.2, 0, 1), smooth = t * t * (3 - 2 * t);
      if (a.transition) a.position = lerpPoint(a.transition.from, a.transition.to, smooth);
      if (t >= 1) {
        a.phaseTime = 0; a.transition = null;
        if (a.phase === 'standing-up') {
          a.slotId = null; a.phase = 'walking';
          if (!a.path.length) arrive(world, a);
        } else {
          a.slotId = a.goal?.slotId ?? null; a.phase = ['rest','garden','sit'].includes(a.goal?.activity) ? 'resting' : 'working';
          a.area = getSlot(a.slotId)?.area ?? areaAt(a.position); a.goal = null;
          pushEvent(world, `${a.name} · ${a.phase === 'working' ? 'back at their desk' : 'settled into the lounge'}`, '', 'info', a.id);
        }
      }
    } else if (a.phase === 'working') {
      if (!a.external) a.progress = Math.min(100, a.progress + dt * (1.6 + a.deskIndex % 3 * 0.2));
      if (!a.external) a.energy = Math.max(0, a.energy - dt * 0.14); if (!a.external) a.tokens += dt * 19;
      if (a.progress >= 100 && !a.external) {
        a.tasksCompleted++; a.progress = 0;
        pushEvent(world, `${a.name} completed a task`, a.task, 'success', a.id);
        a.speech = 'One more thing, done.'; a.speechUntil = world.time + 4;
      }
      if (canRoam(a, autonomous) && (a.external && a.freeToRoam || a.energy < 34 || a.phaseTime > dwell(a))) {
        intents.push(breakFor(a, world));
        a.breaks = (a.breaks ?? 0) + 1;
        a.strolls = 0;
      }
    } else if (a.phase === 'coffee') {
      if (!a.external) a.energy = Math.min(100, a.energy + dt * 0.80);
      if (canRoam(a, autonomous) && a.phaseTime > 18) { intents.push(a.external ? breakFor(a, world) : [a.id, 'work']); a.breaks = (a.breaks ?? 0) + 1; }
    } else if (a.phase === 'resting') {
      if (!a.external) a.energy = Math.min(100, a.energy + dt * 1.15);
      if (canRoam(a, autonomous) && a.phaseTime > 25) { intents.push(a.external ? breakFor(a, world) : [a.id, 'work']); a.breaks = (a.breaks ?? 0) + 1; }
    } else if (a.phase === 'celebrating' && a.phaseTime > 3.2) {
      a.phase = 'idle'; a.phaseTime = 0;
    } else if (a.phase === 'idle' && canRoam(a, autonomous) && a.phaseTime > 7) {
      if (a.external) { intents.push(breakFor(a, world)); a.breaks = (a.breaks ?? 0) + 1; continue; }
      const point = (a.strolls ?? 0) < 2 ? wanderTarget(a.position) : null;
      if (point) { a.strolls = (a.strolls ?? 0) + 1; intents.push([a.id, 'move', point]); }
      else intents.push([a.id, 'work']);
    }
  }
  return intents.reduce((w, [id, command, point = null]) => commandWorld(w, id, command, point).world, world);
}
export function hireAgent(original, archetype) {
  if (!archetypeById(archetype)) return { world: original, error: 'Unknown character.' };
  if (original.agents.length >= DESKS.length) return { world: original, error: 'This studio has twelve desks. Remove an agent to free one.' };
  const world = copy(original);
  const deskIndex = DESKS.findIndex(d => !world.agents.some(a => a.deskIndex === d.index));
  const agent = makeAgent(archetype, deskIndex);
  const duplicates = world.agents.filter(a => a.archetype === archetype).length;
  if (duplicates) agent.name += `-${duplicates + 1}`;
  agent.position = [-2.5, 4.8];
  world.agents.push(agent); pushEvent(world, `${agent.name} joined the studio`, DESKS[deskIndex].label, 'success', agent.id);
  return { ...commandWorld(world, agent.id, 'work'), agentId: agent.id };
}
export function meetingWorld(original, firstId, secondId, message = "Let's compare notes.") {
  if (firstId === secondId) return { world: original, error: 'Choose another agent.' };
  if (![firstId, secondId].every(id => original.agents.some(a => a.id === id))) return { world: original, error: 'Both agents must be in this studio.' };
  const occupied = new Set(original.agents.filter(a => a.id !== firstId && a.id !== secondId).flatMap(a => [a.slotId, a.goal?.slotId]));
  const free = COFFEE.filter(s => !occupied.has(s.id));
  if (free.length < 2) return { world: original, error: 'A coffee chat needs two free spots.' };
  let world = copy(original);
  // Release the two participants' old coffee reservations atomically.
  for (const a of world.agents) if ([firstId, secondId].includes(a.id)) {
    if (a.slotId?.startsWith('coffee')) a.slotId = null;
    if (a.goal?.slotId?.startsWith('coffee')) a.goal = null;
  }
  for (const [i, id] of [firstId, secondId].entries()) {
    const result = commandWorld(world, id, 'coffee', null, { slotId: free[i].id });
    if (result.error) return { world: original, error: result.error };
    world = result.world;
    const a = world.agents.find(a => a.id === id);
    a.speech = (i === 0 ? message : 'Meet you at the coffee corner.').slice(0, 120);
    a.speechUntil = world.time + 30;
  }
  pushEvent(world, 'A little coffee collaboration', 'Two agents are meeting at the counter.', 'info', firstId);
  return { world, error: null };
}
