import test from 'node:test';
import assert from 'node:assert/strict';
import { startCompletionAudio } from '../src/audio/completion.js';

test('completion chime requires a gesture, deduplicates syncs, and respects mute', async () => {
  let state={settings:{sounds:true},completionNotice:{key:1}}, listener, notes=0;
  class Audio {
    state='suspended'; currentTime=0; destination={};
    resume(){this.state='running';return Promise.resolve();}
    close(){return Promise.resolve();}
    createOscillator(){notes++;return {frequency:{},connect(){},start(){},stop(){},disconnect(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const target=new EventTarget(); target.AudioContext=Audio;
  const store={getSnapshot:()=>state,subscribe:fn=>{listener=fn;return()=>{listener=null;};}};
  const stop=startCompletionAudio(store,target);
  listener(); assert.equal(notes,0,'no chime for a bootstrap snapshot');
  state={...state,completionNotice:{key:2}}; listener(); assert.equal(notes,0);
  target.dispatchEvent(new Event('pointerdown'));
  state={...state,completionNotice:{key:3}}; listener(); assert.equal(notes,3);
  listener(); assert.equal(notes,3);
  state={settings:{sounds:false},completionNotice:{key:4}}; listener(); assert.equal(notes,3);
  stop(); assert.equal(listener,null);
});

test('attention alerts play once, including a pending request after audio unlock', async () => {
  let state={settings:{sounds:true},world:{agents:[]}},listener,notes=0;
  class Audio {
    state='suspended';currentTime=0;destination={};
    resume(){this.state='running';return Promise.resolve();} close(){return Promise.resolve();}
    createOscillator(){notes++;return {frequency:{},connect(){},start(){},stop(){},disconnect(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const target=new EventTarget();target.AudioContext=Audio;
  const store={getSnapshot:()=>state,subscribe:fn=>{listener=fn;return()=>{};}};
  const stop=startCompletionAudio(store,target);
  state={...state,world:{agents:[{needsYou:true}]},attentionNotice:{key:1}};listener();assert.equal(notes,0);
  target.dispatchEvent(new Event('pointerdown'));await Promise.resolve();assert.equal(notes,3);
  listener();target.dispatchEvent(new Event('pointerdown'));await Promise.resolve();assert.equal(notes,3);
  state={...state,world:{agents:[{needsYou:false}]}};listener();
  state={...state,world:{agents:[{needsYou:true}]},attentionNotice:{key:2}};listener();assert.equal(notes,6);
  state={...state,settings:{sounds:false},attentionNotice:{key:3}};listener();assert.equal(notes,6);
  stop();
});
