import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexProjectFor, foldCodex, codexTranscriptEntry, startCodexWatching } from '../../server/watcher/codex.js';

const stamp = '2026-10-02T12:00:00.000Z';
const record = (type,payload) => ({ timestamp:stamp,type,payload });
const meta = record('session_meta',{ id:'thread-one', cwd:'/workspace/project', timestamp:stamp, source:'vscode' });

test('Codex cwd matches the most specific imported project and respects path boundaries', () => {
 const projects=[{id:'parent',realPath:'/workspace'},{id:'child',realPath:'/workspace/project'}];
 assert.equal(codexProjectFor('/workspace/project/src',projects).id,'child');
 assert.equal(codexProjectFor('/workspace-other',projects),null);
});
test('Codex lifecycle shows real work, tools, tokens, and idle completion', () => {
 let agent=foldCodex({},meta);
 agent=foldCodex(agent,record('event_msg',{type:'task_started'}));
 assert.equal(agent.active,true);
 agent=foldCodex(agent,record('response_item',{type:'function_call',name:'exec_command',call_id:'call-one'}));
 assert.equal(agent.tool,'exec_command');
 agent=foldCodex(agent,record('response_item',{type:'function_call_output',call_id:'call-one'}));
 assert.equal(agent.tool,null); assert.equal(agent.active,true);
 agent=foldCodex(agent,record('event_msg',{type:'token_count',info:{total_token_usage:{total_tokens:42}}}));
 assert.equal(agent.tokens,42);
 agent=foldCodex(agent,record('event_msg',{type:'task_complete'}));
 assert.equal(agent.active,false); assert.equal(agent.waiting,true); assert.equal(agent.id,'codex:thread-one');
});
test('Codex transcript excludes hidden reasoning and system instructions', () => {
 assert.equal(codexTranscriptEntry(record('response_item',{type:'reasoning',summary:'private'})),null);
 assert.equal(codexTranscriptEntry(record('response_item',{type:'message',role:'system',content:[{type:'input_text',text:'instructions'}]})),null);
 assert.equal(codexTranscriptEntry(record('response_item',{type:'message',role:'assistant',phase:'analysis',content:[{type:'output_text',text:'private'}]})),null);
 assert.equal(codexTranscriptEntry(record('response_item',{type:'message',role:'assistant',phase:'final',content:[{type:'output_text',text:'Done'}]})).text,'Done');
});
test('local Codex watcher attaches sessions, reads appends, and exposes a bounded transcript', async () => {
 const root=await mkdtemp(join(tmpdir(),'office-codex-test-'));
 const dir=join(root,'2026','10','02');await mkdir(dir,{recursive:true});
 const file=join(dir,'rollout-one.jsonl');
 const records=[meta,record('event_msg',{type:'task_started'}),record('response_item',{type:'function_call',name:'Read',call_id:'read'})];
 await writeFile(file,records.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const clock=Date.parse(stamp);await utimes(file,clock/1000,clock/1000);
 const watcher=startCodexWatching({index:{projects:{p:{id:'p',realPath:'/workspace/project'}}},sessionsDir:root,interval:60000,now:()=>clock});
 try {
  await watcher.ready;assert.equal(watcher.agents('p')[0].tool,'Read');
  await appendFile(file,JSON.stringify(record('response_item',{type:'message',role:'assistant',phase:'final',content:[{type:'output_text',text:'Result'}]}))+'\n');
  await watcher.scan();assert.equal(watcher.agents('p')[0].active,false);
  const transcript=await watcher.transcript('codex:thread-one');assert.equal(transcript.entries.at(-1).text,'Result');
  assert.deepEqual((await watcher.transcript('codex:unknown')).entries,[]);
 } finally {watcher.stop();await rm(root,{recursive:true,force:true});}
});
