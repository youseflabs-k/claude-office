import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, commandWorld } from '../src/simulation/engine.js';
import { isWalkable } from '../src/simulation/navigation.js';
import { portableWorld, parseWorld, saveSession, loadSession, STORAGE_KEY } from '../src/store/persistence.js';
import { DEMO_PROJECTS, setProjects } from '../src/simulation/engine.js';
// Workspaces are discovered from the panel server at runtime, so the
// tests install the pack's own four before exercising the engine.
setProjects(DEMO_PROJECTS);
function memoryStorage() { const data = new Map(); return {getItem: k=>data.get(k)??null, setItem:(k,v)=>data.set(k,v)}; }
test('all stable agent positions and metrics survive export/import', () => {
  const w = createWorld(); w.agents[0].name='Custom reviewer'; w.agents[0].external=true;
  const data = portableWorld(w), restored=parseWorld(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.agents[0].name,'Custom reviewer'); assert.equal(restored.agents[0].external,true);
  assert.deepEqual(restored.agents.map(a=>[a.phase,a.position,a.slotId,a.tokens,a.energy]),w.agents.map(a=>[a.phase,a.position,a.slotId,a.tokens,a.energy]));
  assert.equal(restored.events.length,0);
});
test('exported position arrays do not mutate the running world', () => {
  const w=createWorld(), data=portableWorld(w);data.agents[0].position[0]=999;assert.notEqual(w.agents[0].position[0],999);
});
test('imports discard transient animation/path data and relocate unsafe positions', () => {
  let w=createWorld();w=commandWorld(w,w.agents[0].id,'coffee').world;
  const raw=portableWorld(w);raw.agents[0].path=[[Infinity,100]];raw.agents[0].goal={activity:'walk',seat:[999,999]};
  const a=parseWorld(raw).agents[0];assert.equal(a.phase,'idle');assert.deepEqual(a.path,[]);assert.equal(a.goal,null);assert.ok(isWalkable(a.position));
});
test('schema, identifiers, roles and desk assignments are validated', () => {
  assert.throws(()=>parseWorld(null));assert.throws(()=>parseWorld({version:2,agents:[]}));
  for(const mutate of [r=>r.projectId='unknown',r=>r.agents[0].archetype='unknown',r=>r.agents[0].deskIndex=-1,r=>r.agents[1].deskIndex=0,r=>r.agents[1].id=r.agents[0].id,r=>r.agents=Array(13).fill(r.agents[0])]){
    const raw=portableWorld(createWorld());mutate(raw);assert.throws(()=>parseWorld(raw));
  }
});
test('untrusted imports clamp numbers, shorten strings and ignore unexpected keys', () => {
  const raw=portableWorld(createWorld());Object.assign(raw.agents[0],{name:'X'.repeat(500),model:'M'.repeat(500),task:'T'.repeat(1000),tokens:-10,energy:900,progress:Infinity,tasksCompleted:3.8,malicious:true});
  const a=parseWorld(raw).agents[0];assert.equal(a.name.length,48);assert.equal(a.model.length,48);assert.equal(a.task.length,180);
  assert.equal(a.tokens,0);assert.equal(a.energy,100);assert.equal(a.progress,0);assert.equal(a.tasksCompleted,3);assert.equal(a.malicious,undefined);
});
test('duplicate lounge or coffee seats are resolved into unique valid slots', () => {
  const raw=portableWorld(createWorld());for(const a of raw.agents){a.phase='coffee';a.slotId='coffee-0';}
  const w=parseWorld(raw);assert.equal(w.agents.filter(a=>a.phase==='coffee').length,3);
  assert.equal(new Set(w.agents.filter(a=>a.phase==='coffee').map(a=>a.slotId)).size,3);assert.equal(w.agents[3].phase,'idle');
});
test('per-project sessions persist independently and settings are bounded', () => {
  const storage=memoryStorage(), first=createWorld(),second=createWorld('hakeemrx');second.agents[0].name='Second project';
  assert.equal(saveSession({world:first,worlds:{hakeemrx:second},settings:{theme:'night',speed:2,quality:'high',labels:false,autonomous:true}},storage),true);
  const loaded=loadSession(storage);assert.equal(loaded.worlds.hakeemrx.agents[0].name,'Second project');assert.equal(loaded.projectId,'app-creator');assert.equal(loaded.settings.speed,2);assert.equal(loaded.settings.theme,'night');
});
test('blocked storage and corrupt saves fail gracefully', () => {
  const blocked={getItem(){throw new Error('blocked')},setItem(){throw new Error('quota')}};
  assert.equal(loadSession(blocked),null);assert.equal(saveSession({world:createWorld(),worlds:{},settings:{}},blocked),false);
  const storage=memoryStorage();storage.setItem(STORAGE_KEY,'not-json');assert.equal(loadSession(storage),null);
  storage.setItem(STORAGE_KEY,'x'.repeat(2_000_001));assert.equal(loadSession(storage),null);
});
