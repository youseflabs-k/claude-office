import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, commandWorld, stepWorld, hireAgent, meetingWorld, PROJECTS, availableSlot, pushEvent } from '../src/simulation/engine.js';
import { DESKS, COFFEE, LOUNGE } from '../src/simulation/layout.js';
import { isWalkable, distance } from '../src/simulation/navigation.js';
import { DEMO_PROJECTS, setProjects } from '../src/simulation/engine.js';
// Workspaces are discovered from the panel server at runtime, so the
// tests install the pack's own four before exercising the engine.
setProjects(DEMO_PROJECTS);
function advance(world, seconds, autonomous = false) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) world = stepWorld(world, 0.1, autonomous);
  return world;
}
function command(world, id, action, point, options) {
  const result = commandWorld(world, id, action, point, options);
  assert.equal(result.error, null, result.error); return result.world;
}
function watch(world, id, action, expected) {
  world = command(world, id, action);
  const phases = new Set();
  for (let i = 0; i < 600; i++) {
    world = stepWorld(world, 0.1); const a = world.agents.find(a => a.id === id); phases.add(a.phase);
    if (a.phase === 'walking') assert.ok(isWalkable(a.position), 'walking inside obstacle');
    if (a.phase === expected) return { world, phases, agent: a };
  }
  assert.fail(`never reached ${expected}`);
}
test('initial studio has four distinct roles, two at work and two on breaks', () => {
  const w = createWorld(); assert.equal(w.agents.length, 4);
  assert.equal(new Set(w.agents.map(a => a.archetype)).size, 4);
  assert.deepEqual(w.agents.map(a => a.phase), ['working', 'working', 'coffee', 'resting']);
  assert.equal(new Set(w.agents.map(a => a.deskIndex)).size, 4);
});
test('project presets are independent and use the requested project ID', () => {
  for (const p of PROJECTS) { const w = createWorld(p.id); assert.equal(w.projectId, p.id); assert.ok(w.agents.length); }
  assert.notDeepEqual(createWorld(PROJECTS[0].id).agents.map(a => a.id), createWorld(PROJECTS[1].id).agents.map(a => a.id));
});
test('working agent stands, walks to coffee, and returns to sit and type', () => {
  const start = createWorld(), id = start.agents[0].id;
  const coffee = watch(start, id, 'coffee', 'coffee');
  assert.ok(coffee.phases.has('standing-up')); assert.ok(coffee.phases.has('walking'));
  const work = watch(coffee.world, id, 'work', 'working');
  assert.ok(work.phases.has('walking')); assert.ok(work.phases.has('sitting-down'));
  assert.equal(work.agent.slotId, DESKS[0].id);
  assert.ok(distance(work.agent.position, DESKS[0].seat) < 1e-6);
});
test('agents can rest, stand in place, walk to an open point, and celebrate', () => {
  let w = createWorld(); const id = w.agents[0].id;
  const resting = watch(w, id, 'rest', 'resting'); assert.ok(resting.agent.slotId.startsWith('lounge'));
  w = watch(resting.world, id, 'idle', 'idle').world;
  w = command(w, id, 'move', [-2.5, 4.8]); w = advance(w, 30);
  assert.equal(w.agents[0].phase, 'idle'); assert.ok(distance(w.agents[0].position, [-2.5, 4.8]) < 1e-5);
  w = command(w, id, 'celebrate'); assert.equal(w.agents[0].phase, 'celebrating');
  w = advance(w, 4); assert.equal(w.agents[0].phase, 'idle');
});
test('commands and simulation steps do not mutate previous snapshots', () => {
  const w = createWorld(), snapshot = JSON.stringify(w);
  commandWorld(w, w.agents[0].id, 'coffee'); stepWorld(w, .1); hireAgent(w, 'design-agent');
  assert.equal(JSON.stringify(w), snapshot);
});
test('invalid agent IDs, actions and nonfinite floor positions are safe errors', () => {
  const w = createWorld();
  for (const [id, action, point] of [['missing','work'],[w.agents[0].id,'delete'],[w.agents[0].id,'move',[NaN,0]]]) {
    const r = commandWorld(w, id, action, point); assert.ok(r.error); assert.equal(r.world, w);
  }
});
test('reservations prevent more than three agents choosing coffee or lounge', () => {
  for (const [action, slots] of [['coffee', COFFEE], ['rest', LOUNGE]]) {
    let w = createWorld();
    for (const a of w.agents) { a.phase = 'idle'; a.slotId = null; a.goal = null; a.position = DESKS[a.deskIndex].entry.slice(); }
    for (let i = 0; i < 3; i++) w = command(w, w.agents[i].id, action);
    assert.equal(new Set(w.agents.slice(0,3).map(a => a.goal?.slotId || a.slotId)).size, 3);
    const r = commandWorld(w, w.agents[3].id, action); assert.ok(r.error); assert.equal(r.world, w);
    assert.equal(availableSlot(w, action, w.agents[3].id), undefined);
    w = advance(w, 45); assert.equal(w.agents.filter(a => slots.some(s => s.id === a.slotId)).length, 3);
  }
});
test('repeated status commands do not restart walking or sit/stand transitions', () => {
  let w = createWorld(); const id = w.agents[0].id;
  w = command(w, id, 'coffee');
  for (let i = 0; i < 400; i++) { w = command(w, id, 'coffee'); w = stepWorld(w, .1); }
  assert.equal(w.agents[0].phase, 'coffee');
  for (let i = 0; i < 400; i++) { w = command(w, id, 'work'); w = stepWorld(w, .1); }
  assert.equal(w.agents[0].phase, 'working');
});
test('coffee chats reserve distinct slots and fail atomically when full', () => {
  let w = createWorld(), first = w.agents[0].id, second = w.agents[1].id;
  const result = meetingWorld(w, first, second, 'Review the test plan.'); assert.equal(result.error, null);
  w = result.world; assert.notEqual(w.agents[0].goal.slotId, w.agents[1].goal.slotId);
  w = advance(w, 40); assert.equal(w.agents[0].phase, 'coffee'); assert.equal(w.agents[1].phase, 'coffee');
  assert.ok(meetingWorld(w, first, first).error);
  let full = createWorld(); full = command(full, full.agents[3].id, 'coffee');
  const failed = meetingWorld(full, full.agents[0].id, full.agents[1].id); assert.ok(failed.error); assert.equal(failed.world, full);
});
test('hiring supports all sixteen appearances but caps occupancy at twelve', () => {
  let w = createWorld();
  for (let i = 0; i < 8; i++) { const r = hireAgent(w, 'design-agent'); assert.equal(r.error, null); w = r.world; }
  assert.equal(w.agents.length, 12); assert.equal(new Set(w.agents.map(a => a.deskIndex)).size, 12);
  assert.equal(new Set(w.agents.map(a => a.id)).size, 12);
  assert.ok(hireAgent(w, 'code-reviewer').error); assert.ok(hireAgent(createWorld(), 'not-in-catalog').error);
});
test('simulation metrics are bounded and completed tasks produce events', () => {
  let w = createWorld(); w.agents[0].progress = 99.9;
  const before = w.agents[0].tokens; w = advance(w, 1);
  assert.equal(w.agents[0].tasksCompleted, 1); assert.ok(w.agents[0].tokens > before);
  assert.ok(w.events.some(e => e.kind === 'success' && e.agentId === w.agents[0].id));
  w = advance(w, 180);
  for (const a of w.agents) { assert.ok(a.energy >= 0 && a.energy <= 100); assert.ok(a.progress >= 0 && a.progress <= 100); }
});
test('externally controlled agents never accumulate fabricated metrics or autonomous commands', () => {
  let w = createWorld(); for (const a of w.agents) a.external = true;
  const before = w.agents.map(a => [a.tokens, a.progress, a.energy, a.tasksCompleted, a.phase]);
  w = advance(w, 100, true);
  assert.deepEqual(w.agents.map(a => [a.tokens, a.progress, a.energy, a.tasksCompleted, a.phase]), before);
});
test('autonomous agents complete safe break/return cycles', () => {
  let w = createWorld(); w.agents[0].energy = 20;
  const phases = new Set();
  for (let i=0; i<900; i++) { w = stepWorld(w,.1,true); phases.add(w.agents[0].phase); }
  assert.ok(phases.has('resting')); assert.ok(phases.has('walking')); assert.ok(phases.has('working'));
  for (const a of w.agents) assert.ok(a.position.every(Number.isFinite));
});
test('invalid dt is ignored and large dt is clamped', () => {
  const w = createWorld(); for(const dt of [NaN,Infinity,0,-1]) assert.equal(stepWorld(w,dt),w);
  assert.equal(stepWorld(w,100).time, .25);
});
test('the activity feed has a hard maximum length', () => {
  const w = createWorld(); for(let i=0;i<150;i++)pushEvent(w,`event-${i}`);
  assert.equal(w.events.length,80); assert.equal(w.events[0].title,'event-149');
});
