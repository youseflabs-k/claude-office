#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/simulation/catalog.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const requiredClips=['idle','typing','walk','coffee-sip','celebrate','sit-down','stand-up','rest'];
async function walk(directory) {
  const result=[];for(const e of await readdir(directory,{withFileTypes:true})){
    const p=join(directory,e.name);if(e.isDirectory())result.push(...await walk(p));else result.push(p);
  }return result;
}
const files=(await walk(join(root,'public/models'))).filter(p=>p.endsWith('.glb'));
assert.equal(files.filter(p=>!p.includes('/studio/')).length,52,'Expected the original 16 characters and 36 furniture models');
assert.equal(files.filter(p=>p.includes('/studio/')).length,11,'Expected 11 generated studio and garden assets');
let clipCount=0;const inventory=[];
for(const path of files){
  const bytes=await readFile(path);assert.equal(bytes.toString('ascii',0,4),'glTF',path);assert.equal(bytes.readUInt32LE(4),2,path);
  assert.equal(bytes.readUInt32LE(8),bytes.length,`GLB length: ${path}`);
  const length=bytes.readUInt32LE(12);assert.equal(bytes.toString('ascii',16,20),'JSON');
  const model=JSON.parse(bytes.toString('utf8',20,20+length));
  assert.ok(model.scenes?.length,`Missing scene: ${path}`);
  for(const view of model.bufferViews??[])assert.ok((view.byteOffset??0)+view.byteLength<=(model.buffers[view.buffer].byteLength),`Invalid buffer bounds: ${path}`);
  for(const buffer of model.buffers??[])assert.ok(!buffer.uri,`External buffer is not allowed: ${path}`);
  for(const texture of model.images??[])assert.ok(!texture.uri||texture.uri.startsWith('data:'),`External texture: ${path}`);
  const names=(model.animations??[]).map(a=>a.name);clipCount+=names.length;
  if(path.includes('/characters/')){
    assert.deepEqual([...names].sort(),[...requiredClips].sort(),`Animation clips: ${path}`);
    for(const animation of model.animations){
      assert.ok(animation.channels.length,`Empty clip ${animation.name}`);
      for(const channel of animation.channels){assert.ok(model.nodes[channel.target.node]);assert.ok(animation.samplers[channel.sampler]);}
    }
  }
  inventory.push({file:relative(root,path).split('\\').join('/'),bytes:bytes.length,nodes:model.nodes?.length??0,meshes:model.meshes?.length??0,clips:names});
}
assert.equal(clipCount,128);
for(const character of CHARACTERS){
  assert.ok((await stat(join(root,`public/models/characters/${character.id}.glb`))).size);
  const png=await readFile(join(root,`public/portraits/${character.id}.png`));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
}
const source=await readFile(join(root,'src/scene/environment.js'),'utf8');
for(const match of source.matchAll(/prop\('([^']+)'/g))assert.ok((await stat(join(root,`public/models/furniture/${match[1]}.glb`))).size,match[1]);
const report={models:files.length,characters:CHARACTERS.length,furniture:files.length-CHARACTERS.length,animationClips:clipCount,portraits:CHARACTERS.length,modelBytes:inventory.reduce((n,f)=>n+f.bytes,0),files:inventory};
if(process.argv.includes('--write'))await writeFile(join(root,'docs/asset-inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Verified ${report.models} local GLB models (${report.characters} characters, ${report.furniture} props), ${report.animationClips} animation clips and ${report.portraits} portraits.`);
console.log('All environment prop references resolve. No model relies on external buffers or textures.');
