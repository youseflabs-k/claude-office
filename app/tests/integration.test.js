import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFor, labelRoom } from '../src/integrations/claude.js';
import { store } from '../src/store/store.js';
import { createWorld } from '../src/simulation/engine.js';
import { applyAgentEvent, installAgentBridge } from '../src/integrations/agentBridge.js';
import { DEMO_PROJECTS, setProjects } from '../src/simulation/engine.js';
// Workspaces are discovered from the panel server at runtime, so the
// tests install the pack's own four before exercising the engine.
setProjects(DEMO_PROJECTS);

test('backend events apply safe metrics without emitting a command feedback loop', () => {
  globalThis.window = new EventTarget();
  const stop=installAgentBridge();const outbound=[];
  window.addEventListener('cozy-office:command', e=>outbound.push(e.detail));
  const world=createWorld();store.setUI({world,selectedId:world.agents[0].id});
  const id=world.agents[0].id;
  applyAgentEvent({agentId:id,status:'working',model:'My backend',tokens:4500,progress:55,energy:81,task:'Run a real job',message:'Status from your server'});
  const agent=store.getSnapshot().world.agents[0];
  assert.equal(agent.tokens,4500);assert.equal(agent.progress,55);assert.equal(agent.external,true);assert.equal(agent.model,'My backend');
  assert.equal(agent.speech,'Status from your server');assert.equal(outbound.length,0);
  store.command('coffee',null,id);assert.equal(outbound.length,1);assert.equal(outbound[0].command,'coffee');assert.equal(outbound[0].projectId,'app-creator');
  assert.equal(window.cozyOffice.getAgents().length,4);
  stop();assert.equal(window.cozyOffice,undefined);delete globalThis.window;
});
test('malformed, unknown-agent and unknown-status backend events are rejected', () => {
  assert.throws(()=>applyAgentEvent(null));assert.throws(()=>applyAgentEvent({agentId:'unknown'}));
  assert.throws(()=>applyAgentEvent({agentId:store.getSnapshot().world.agents[0].id,status:'not-real'}));
});
test('telemetry is bounded and invalid types cannot overwrite numbers', () => {
  const id=store.getSnapshot().world.agents[0].id;
  applyAgentEvent({agentId:id,tokens:-100,progress:500,energy:'bad',tasksCompleted:99999999999});
  const a=store.getSnapshot().world.agents[0];assert.equal(a.tokens,0);assert.equal(a.progress,100);assert.equal(a.energy,81);assert.equal(a.tasksCompleted,1e9);
});

 test('Claude idle status cannot send agents to work without tool activity', () => {
  assert.equal(commandFor({}), 'rest');
  assert.equal(commandFor({ waiting: true }), 'coffee');
  assert.equal(commandFor({ needsYou: true }), 'sit');
  assert.equal(commandFor({ status: 'done' }), 'celebrate');
  assert.equal(commandFor({ tool: 'Read' }), 'work');
});

test('live work starts a route and selecting details does not open output', () => {
  const previous = store.getSnapshot();
  const world = createWorld(); world.agents = [];
  store.setUI({ world, selectedId:null, watching:null, detailsOpen:false });
  const liveAgent = { id:'codex:fixture', sessionId:'codex:fixture', isSession:true, provider:'codex', agentType:'codex', sessionName:'Codex fixture', tool:'Read', active:true, tokens:12, firstSeenAt:1 };
  store.claudeSync({desks:[liveAgent],porch:[]},world.projectId);
  const agent = store.getSnapshot().world.agents[0];
  assert.equal(agent.phase,'walking'); assert.ok(agent.path.length > 0); assert.equal(agent.provider,'codex');
  store.watch(agent.id);
  store.select(agent.id); assert.equal(store.getSnapshot().detailsOpen,true); assert.equal(store.getSnapshot().watching,null);
  store.watch(agent.id); assert.equal(store.getSnapshot().watching,agent.id);
  store.claudeSync({desks:[{...liveAgent,tool:null,active:false,waiting:true}],porch:[]},world.projectId);
  assert.equal(store.getSnapshot().world.agents[0].freeToRoam,true);
  store.setUI(previous);
});

test('needs-you agents stay seated with an attention bubble until cleared', () => {
  const previous = store.getSnapshot(); const world = createWorld(); world.agents=[];
  store.setUI({world});
  const live = {id:'attention-fixture',sessionId:'attention-fixture',isSession:true,agentType:'claude',needsYou:true};
  store.claudeSync({desks:[live],porch:[]},world.projectId);
  const person=store.getSnapshot().world.agents[0];
  assert.equal(person.phase,'walking'); assert.equal(person.goal.slotId,'desk-0'); assert.equal(person.freeToRoam,false); assert.match(person.speech,/Needs you/);
  store.claudeSync({desks:[{...live,needsYou:false}],porch:[]},world.projectId);
  assert.equal(store.getSnapshot().world.agents[0].needsYou,false);
  assert.notEqual(store.getSnapshot().world.agents[0].speechUntil,Infinity);
  store.setUI(previous);
});

test('Claude labels follow Cubicle folder and subagent naming', () => {
  const names=labelRoom([
    {id:'session-a',sessionId:'session-a',isSession:true,sessionName:'claude-office'},
    {id:'child-a',sessionId:'session-a',agentType:'Explore'},
    {id:'child-b',sessionId:'session-a',agentType:'Explore'},
  ]);
  assert.equal(names.get('session-a'),'claude-office');
  assert.equal(names.get('child-a'),'claude-office › Explore');
  assert.equal(names.get('child-b'),'claude-office › Explore 2');
});

test('live agents stay seated between tools, notify completion once, and walk back from a break', () => {
  const previous=store.getSnapshot(); const world=createWorld(); world.agents=[];
  store.setUI({world,ready:true,paused:false});
  let live={id:'claude-active',sessionId:'claude-active',isSession:true,active:true,tool:'Read'};
  const sync=()=>store.claudeSync({desks:[live],porch:[]},world.projectId);
  sync();
  for(let i=0;i<400;i++) store.tick(.1);
  let person=store.getSnapshot().world.agents[0]; assert.equal(person.phase,'working');
  const seat=person.position.slice();
  live={...live,tool:null}; // Claude is thinking / waiting for an API retry.
  sync();
  for(let i=0;i<1500;i++) { if(i%15===0) sync(); store.tick(.1); }
  person=store.getSnapshot().world.agents[0];
  assert.equal(person.phase,'working'); assert.deepEqual(person.position,seat); assert.equal(person.freeToRoam,false);
  live={...live,active:false,waiting:true,completedAt:1234}; sync();
  assert.match(store.getSnapshot().world.agents[0].speech,/Task done/);
  const notice=store.getSnapshot().completionNotice.key; sync(); assert.equal(store.getSnapshot().completionNotice.key,notice);
  for(let i=0;i<1000;i++) store.tick(.1);
  const away=store.getSnapshot().world.agents[0].position.slice();
  live={...live,active:true,waiting:false,tool:'Bash'}; sync();
  person=store.getSnapshot().world.agents[0];
  assert.deepEqual(person.position,away); assert.equal(person.goal.activity,'work');
  const goal=structuredClone(person.goal); sync(); assert.deepEqual(store.getSnapshot().world.agents[0].goal,goal);
  let sawWalking=false;
  for(let i=0;i<900;i++) {
    const before=store.getSnapshot().world.agents[0].position.slice(); store.tick(.1);
    person=store.getSnapshot().world.agents[0]; sawWalking ||= person.phase==='walking';
    assert.ok(Math.hypot(person.position[0]-before[0],person.position[1]-before[1]) < .35,'moves continuously, never teleports');
  }
  assert.ok(sawWalking); assert.equal(person.phase,'working'); assert.deepEqual(person.position,seat);
  store.setUI(previous);
});

test('questions keep agents seated, show the question, and notify once per request', () => {
  const previous=store.getSnapshot(),world=createWorld();world.agents=[];
  store.setUI({world,ready:true,paused:false});
  let agent={id:'ask-fixture',sessionId:'ask-fixture',isSession:true,active:true};
  const sync=()=>store.claudeSync({desks:[agent],porch:[]},world.projectId);
  sync();for(let i=0;i<400;i++)store.tick(.1);
  const seat=store.getSnapshot().world.agents[0].position.slice();
  agent={...agent,needsYou:true,attentionAt:100,attentionText:'Which layout would you prefer?'};sync();
  const person=store.getSnapshot().world.agents[0];
  assert.equal(person.phase,'resting');assert.deepEqual(person.position,seat);assert.match(person.speech,/Which layout/);assert.equal(person.freeToRoam,false);
  const key=store.getSnapshot().attentionNotice.key;sync();assert.equal(store.getSnapshot().attentionNotice.key,key);
  for(let i=0;i<1200;i++)store.tick(.1);
  assert.equal(store.getSnapshot().world.agents[0].needsYou,true);assert.deepEqual(store.getSnapshot().world.agents[0].position,seat);
  agent={...agent,needsYou:false};sync();agent={...agent,needsYou:true,attentionAt:200};sync();
  assert.equal(store.getSnapshot().attentionNotice.key,key+1);
  store.setUI(previous);
});
