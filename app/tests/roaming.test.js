import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PROJECTS, setProjects, createWorld, createLiveWorld, makeAgent, commandWorld, stepWorld,
} from '../src/simulation/engine.js';

setProjects(DEMO_PROJECTS);

const BREAKS = new Set(['coffee', 'resting']);

// Watch a whole stretch rather than sampling one instant: a break has a start
// and an end, so whether an agent happens to be away at second 80 says very
// little about whether it ever goes.
function observe(agent, seconds, { autonomous = false } = {}) {
  let world = createLiveWorld('app-creator');
  world.agents.push(agent);
  world = commandWorld(world, agent.id, 'work').world;

  const phases = [];
  for (let t = 0; t < seconds; t += 0.1) {
    world = stepWorld(world, 0.1, autonomous);
    const { phase } = world.agents[0];
    if (phases.at(-1) !== phase) phases.push(phase);
  }
  return phases;
}

const live = (id, deskIndex, freeToRoam) => Object.assign(
  makeAgent('code-reviewer', deskIndex, id), { external: true, freeToRoam },
);

test('idle live agents never return to working without new backend work', () => {
  const phases = observe(live('idle-one', 0, true), 300);
  assert.ok(phases.some(p => BREAKS.has(p)), phases.join(' → '));
  assert.equal(phases.includes('working'), false, phases.join(' → '));
});

// Externally owned telemetry must not by itself ground somebody forever, but
// an agent actually running a tool has to stay at its desk.
test('a live agent with work to do never leaves its desk', () => {
  const phases = observe(live('busy-one', 1, false), 400);
  assert.deepEqual(phases.filter(p => BREAKS.has(p)), [],
    `expected no breaks, saw ${phases.join(' → ')}`);
});

// The studio's own setting still governs simulated agents, unchanged.
test('simulated agents still follow the autonomy setting', () => {
  const off = observe(makeAgent('docs-writer', 2, 'sim-off'), 400);
  assert.deepEqual(off.filter(p => BREAKS.has(p)), [], 'autonomy off means nobody strays');

  const on = observe(makeAgent('docs-writer', 2, 'sim-on'), 400, { autonomous: true });
  assert.ok(on.some(p => BREAKS.has(p)), `expected a break in ${on.join(' → ')}`);
});

// Breaks should not always be the same break, or the lounge is never used.
test('breaks vary between the coffee bar and the lounge', () => {
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    for (const p of observe(live(`vary-${i}`, i, true), 150)) {
      if (BREAKS.has(p)) seen.add(p);
    }
  }
  assert.deepEqual([...seen].sort(), ['coffee', 'resting'],
    `expected both kinds of break, saw ${[...seen]}`);
});

test('idle agents read in the lounge and stay on leisure activities', () => {
  let world = createLiveWorld('app-creator');
  world.agents.push(live('reader', 2, true));
  let reading = false;
  for (let i = 0; i < 3000; i++) {
    world = stepWorld(world, 0.1);
    const a = world.agents[0];
    reading ||= a.phase === 'resting' && a.leisure === 'reading';
    assert.notEqual(a.phase, 'working');
  }
  assert.ok(reading);
  world.agents[0].freeToRoam = false;
  world = commandWorld(world, 'reader', 'work').world;
  for (let i = 0; i < 500; i++) world = stepWorld(world, 0.1);
  assert.equal(world.agents[0].phase, 'working', 'real work can return an idle agent to its desk');
});

test('nearby idle agents chat without sending anyone back to work', () => {
  let world = createLiveWorld('app-creator');
  world.agents.push(live('chat-a', 0, true), live('chat-b', 1, true));
  for (const [i, a] of world.agents.entries()) {
    a.phase = 'coffee'; a.position = [-8.7 + i * 1.3, -3.1]; a.slotId = `coffee-${i}`;
  }
  world = stepWorld(world, 0.1);
  assert.ok(world.agents.every(a => a.speech && a.phase === 'coffee'));
});

test('idle live agents use garden benches, walk outside, and rest at desks without typing', () => {
  let world=createWorld(); world.agents=world.agents.slice(0,1);
  Object.assign(world.agents[0],{external:true,freeToRoam:true,phase:'idle',phaseTime:8,slotId:null,goal:null,path:[]});
  const seen=new Set();
  for(let i=0;i<4800;i++) {
    world=stepWorld(world,.25,false); const a=world.agents[0];
    assert.notEqual(a.phase,'working');
    if(a.phase==='resting' && a.area==='garden') seen.add('garden');
    if(a.phase==='walking' && a.position[1]>11) seen.add('walk');
    if(a.phase==='resting' && a.leisure==='desk-rest') seen.add('desk');
  }
  assert.deepEqual([...seen].sort(),['desk','garden','walk']);
});
