import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTail } from '../../server/transcript-read.js';

test('live transcript keeps recent entries and clips oversized messages', async () => {
 const dir=await mkdtemp(join(tmpdir(),'office-tail-'));const path=join(dir,'session.jsonl');
 try {
  const rows=Array.from({length:600},(_,i)=>({type:'assistant',timestamp:String(i),message:{content:[{type:'text',text:i===599?'x'.repeat(15000):`message ${i}`}]}}));
  await writeFile(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const tail=await readTail({id:'session',path},'session');
  assert.equal(tail.entries.length,120);assert.equal(tail.entries[0].at,'480');assert.equal(tail.entries.at(-1).at,'599');
  assert.ok(tail.entries.at(-1).text.length<4100);assert.ok(tail.truncated);assert.ok(tail.version);
 } finally {await rm(dir,{recursive:true,force:true});}
});
