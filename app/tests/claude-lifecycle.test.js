import test from 'node:test';
import assert from 'node:assert/strict';
import { readActivity, activityRecord } from '../../server/watcher/claude-activity.js';
import { emptyState, fold, roomFor } from '../../server/state/fold.js';

test('Claude keeps an active turn across tool gaps and API retries until registry idle', () => {
  let state=emptyState();
  const apply=e=>state=fold(state,{sessionId:'s',at:10,...e});
  apply({kind:'session.start',projectId:'p',cwd:'/work/p'});
  apply({kind:'session.status',status:'busy'});
  apply({kind:'agent.tool',agentId:'s',tool:'Bash'});
  apply({kind:'agent.tool',agentId:'s',tool:null});
  assert.equal(state.agents.s.active,true);
  assert.equal(state.agents.s.waiting,false);
  assert.equal(roomFor(state,'p').desks.filter(Boolean)[0].active,true);
  apply({kind:'session.status',status:'idle',at:200});
  assert.equal(state.agents.s.active,false); assert.equal(state.agents.s.completedAt,200);
});

test('subagents are active while thinking or waiting on background work, ending only on stop', () => {
  let state=emptyState();
  const apply=e=>state=fold(state,{sessionId:'s',at:10,...e});
  apply({kind:'session.start',projectId:'p'});
  apply({kind:'agent.start',agentId:'child',agentType:'Explore'});
  apply({kind:'agent.tool',agentId:'child',tool:'Read'});
  apply({kind:'agent.tool',agentId:'child',tool:null});
  assert.equal(state.agents.child.active,true);
  apply({kind:'agent.stop',agentId:'child',at:100});
  assert.equal(state.agents.child.active,false); assert.equal(state.agents.child.completedAt,100);
});

test('an idle registry cannot release a prompt awaiting its API response', () => {
  let state=emptyState();
  const apply=e=>state=fold(state,{sessionId:'s',agentId:'s',...e});
  apply({kind:'session.start',projectId:'p',at:1});
  const prompt=activityRecord({type:'user',timestamp:'2026-10-02T12:26:43.375Z',message:{role:'user',content:[{type:'text',text:'new task'}]}});
  apply({kind:'agent.activity',...prompt});
  apply({kind:'session.status',status:'idle',statusUpdatedAt:prompt.at+11,at:prompt.at+11});
  assert.equal(state.agents.s.active,true); assert.equal(state.agents.s.waiting,false); assert.equal(state.agents.s.completedAt,undefined);
  assert.equal(activityRecord({type:'system',subtype:'api_error',timestamp:'2026-10-02T12:28:00Z'}),null);
  const response=activityRecord({type:'assistant',timestamp:'2026-10-02T12:30:00Z',message:{content:[{type:'text',text:'finished'}],stop_reason:null}});
  apply({kind:'agent.activity',...response});
  assert.equal(state.agents.s.active,true,'stale idle from prompt time cannot finish a newer response');
  apply({kind:'session.status',status:'idle',statusUpdatedAt:response.at+10,at:response.at+10});
  assert.equal(state.agents.s.active,false); assert.ok(state.agents.s.completedAt);
});

test('tool calls, thinking and error records are never completion candidates', () => {
  const timestamp='2026-10-02T12:30:00Z';
  for(const content of [[{type:'thinking'}],[{type:'tool_use'}],[{type:'text'}]]) {
    const patch=activityRecord({type:'assistant',timestamp,message:{content,stop_reason:'tool_use'}});
    assert.equal(patch.responseCanComplete,false); assert.equal(patch.pendingTurn,true);
  }
  assert.equal(activityRecord({type:'assistant',timestamp,isApiErrorMessage:true,message:{content:[{type:'text'}]}}),null);
  assert.equal(activityRecord({type:'assistant',timestamp,message:{content:[{type:'text'}],stop_reason:'end_turn'}}).completed,true);
});

test('Claude interruption markers release the desk without successful completion', () => {
  for(const text of ['[Request interrupted by user]','[Request interrupted by user for tool use]']) {
    let state=emptyState();
    const apply=e=>state=fold(state,{sessionId:'s',agentId:'s',...e});
    apply({kind:'session.start',projectId:'p',at:1}); apply({kind:'session.status',status:'busy',at:2});
    const patch=activityRecord({type:'user',timestamp:'2026-10-02T12:26:43.375Z',message:{content:[{type:'text',text}]}});
    assert.equal(patch.interrupted,true); assert.equal(patch.completed,false);
    apply({kind:'agent.activity',...patch});
    assert.equal(state.agents.s.active,false); assert.equal(state.agents.s.waiting,true);
    assert.equal(state.agents.s.pendingTurn,false); assert.equal(state.agents.s.completedAt,undefined);
  }
});

test('an interrupted but still open Claude session stays visible for idle routines', () => {
  let state=emptyState();
  state=fold(state,{kind:'session.start',sessionId:'s',projectId:'p',at:1});
  state=fold(state,{kind:'session.status',sessionId:'s',status:'idle',at:2});
  assert.equal(roomFor(state,'p',3600000).desks.filter(Boolean).length,1);
  state=fold(state,{kind:'session.end',sessionId:'s',at:3600001});
  assert.equal(roomFor(state,'p',3600002).desks.filter(Boolean).length,0);
});

test('bootstrap preserves an interruption through metadata and delayed older output', async () => {
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises'); const {join}=await import('node:path'); const {tmpdir}=await import('node:os');
  const dir=await mkdtemp(join(tmpdir(),'claude-interrupt-')); const path=join(dir,'session.jsonl');
  try {
    const records=[
      {type:'user',timestamp:'2026-10-02T12:25:00Z',message:{content:[{type:'text',text:'task'}]}},
      {type:'user',timestamp:'2026-10-02T12:26:00Z',message:{content:[{type:'text',text:'[Request interrupted by user]'}]}},
      {type:'assistant',timestamp:'2026-10-02T12:25:01Z',message:{content:[{type:'thinking'}]}},
      {type:'system',subtype:'away_summary',timestamp:'2026-10-02T12:27:00Z'},
    ];
    await writeFile(path,records.map(r=>JSON.stringify(r)).join('\n')+'\n');
    const activity=await readActivity(path);
    assert.equal(activity.interrupted,true); assert.equal(activity.pendingTurn,false); assert.equal(activity.completed,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('Claude question tool sets attention until its matching answer arrives', () => {
  let state=emptyState();
  const apply=e=>state=fold(state,{sessionId:'s',agentId:'s',...e});
  apply({kind:'session.start',projectId:'p',at:1});
  const ask=activityRecord({type:'assistant',timestamp:'2026-10-02T12:00:00Z',message:{stop_reason:'tool_use',content:[{type:'tool_use',name:'AskUserQuestion',id:'ask-1',input:{questions:[{question:'Which layout would you prefer?'}]}}]}});
  apply({kind:'agent.activity',...ask}); apply({kind:'agent.tool',tool:'AskUserQuestion',at:ask.at});
  assert.equal(state.agents.s.needsYou,true); assert.match(state.agents.s.attentionText,/Which layout/);
  apply({kind:'agent.activity',...activityRecord({type:'user',timestamp:'2026-10-02T12:00:01Z',message:{content:[{type:'tool_result',tool_use_id:'other'}]}})});
  assert.equal(state.agents.s.needsYou,true,'other background tool results do not clear the question');
  apply({kind:'agent.activity',...activityRecord({type:'user',timestamp:'2026-10-02T12:00:02Z',message:{content:[{type:'tool_result',tool_use_id:'ask-1'}]}})});
  assert.equal(state.agents.s.needsYou,false);
});

test('a question in ordinary response text finishes idle without attention', () => {
  let state=emptyState();
  const apply=e=>state=fold(state,{sessionId:'s',agentId:'s',...e});
  apply({kind:'session.start',projectId:'p',at:1}); apply({kind:'session.status',status:'busy',at:2});
  apply({kind:'agent.activity',...activityRecord({type:'assistant',timestamp:'2026-10-02T12:00:00Z',message:{content:[{type:'text',text:'The branch is still unpushed. Want me to push it?'}],stop_reason:null}})});
  apply({kind:'agent.activity',...activityRecord({type:'system',subtype:'turn_duration',timestamp:'2026-10-02T12:00:01Z'})});
  assert.equal(state.agents.s.needsYou,false); assert.equal(state.agents.s.active,false);
  assert.equal(state.agents.s.waiting,true); assert.equal(state.agents.s.attentionText,null);
  assert.ok(state.agents.s.completedAt);
});

// Recovery must clear an attention latch left by the old text-question heuristic.
test('normal completion clears stale text attention but preserves a pending answer tool', () => {
  const idleAgent={id:'s',sessionId:'s',isSession:true,status:'running',active:true,needsYou:true,attentionReason:'question',attentionText:'Want me to push it?'};
  let state={sessions:{s:{id:'s',projectId:'p',status:'busy',statusAt:1}},agents:{s:idleAgent}};
  state=fold(state,{kind:'agent.activity',sessionId:'s',agentId:'s',completed:true,at:10});
  assert.equal(state.agents.s.needsYou,false); assert.equal(state.agents.s.attentionText,null);
  state={sessions:{s:{id:'s',status:'busy',statusAt:1}},agents:{s:{...idleAgent,attentionToolId:'ask'}}};
  state=fold(state,{kind:'agent.activity',sessionId:'s',agentId:'s',completed:true,at:10});
  assert.equal(state.agents.s.needsYou,true); assert.equal(state.agents.s.attentionToolId,'ask');
});
