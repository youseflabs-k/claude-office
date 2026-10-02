import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Native 3D assets, authored here so geometry can be refined and regenerated.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
};
const out = fileURLToPath(new URL('../public/models/furniture/studio/', import.meta.url));
await mkdir(out, { recursive: true });
const mat = (name, color, opts = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...opts }); m.name = name; return m; };
const oak = mat('studio-oak', '#bd956d'), dark = mat('powder-coated-green', '#344d43'), clay = mat('terracotta', '#b4785b'), stone = mat('limestone', '#bdb7a3');
const greens = ['#385c42', '#557448', '#708657', '#839566'].map((c,i) => mat(`foliage-${i}`,c));
const bark = mat('bark', '#78604b');
function mesh(g, geom, m, p = [0,0,0], scale) { const o = new THREE.Mesh(geom,m); o.position.set(...p); if (scale) o.scale.set(...scale); o.castShadow=o.receiveShadow=true; g.add(o); return o; }
const box = (g,size,p,m,r=.04) => mesh(g,new RoundedBoxGeometry(...size,2,Math.min(r,Math.min(...size)/3)),m,p);
const ball = (g,r,p,m,scale=[1,1,1]) => mesh(g,new THREE.SphereGeometry(r,12,8),m,p,scale);
function branch(g,a,b,r1,r2,m=bark) { const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b), delta=end.clone().sub(start); const o=mesh(g,new THREE.CylinderGeometry(r2,r1,delta.length(),8),m,start.add(end).multiplyScalar(.5).toArray()); o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return o; }
async function save(name,build) { const g=new THREE.Group(); g.name=name; build(g); const glb=await new GLTFExporter().parseAsync(g,{binary:true}); await writeFile(`${out}/${name}.glb`,Buffer.from(glb)); console.log(`${name}: ${(glb.byteLength/1024).toFixed(0)} KB`); }
await save('oak-workstation',g=>{
  box(g,[2.6,.12,1.15],[0,1.06,0],oak,.09);
  for(const x of [-1.08,1.08]) { box(g,[.08,1,.08],[x,.5,-.42],dark);box(g,[.08,1,.08],[x,.5,.42],dark);box(g,[.10,.07,.98],[x,.08,0],dark); }
  box(g,[2.2,.11,.12],[0,.36,-.38],dark);
  box(g,[.57,.52,.75],[.91,.72,-.02],oak);box(g,[.04,.025,.30],[.61,.74,.16],dark);
});
await save('desk-lamp',g=>{
  mesh(g,new THREE.CylinderGeometry(.13,.15,.035,20),dark,[0,.018,0]);
  branch(g,[0,.03,0],[0,.40,0],.022,.022,dark);branch(g,[0,.40,0],[.18,.59,0],.018,.018,dark);
  const shade=mesh(g,new THREE.ConeGeometry(.115,.20,20,1,true),mat('brass-shade','#b59a69',{metalness:.5,roughness:.4}),[.18,.56,0]);shade.rotation.z=-.3;
  ball(g,.07,[.18,.50,0],mat('bulb','#fff0d0',{emissive:'#ffd09a',emissiveIntensity:.8}),[1,.45,1]);
});
await save('olive-tree',g=>{
  branch(g,[0,0,0],[.1,2.5,.08],.18,.06);
  for(let i=0;i<9;i++) { const a=i*2.4, h=1.3+i*.13, x=Math.cos(a)*(.7+i%3*.18), z=Math.sin(a)*(.7+i%3*.18);
    branch(g,[.06,h*.75,0],[x,h+.6,z],.055,.014);
    for(let j=0;j<4;j++) ball(g,.38,[x+Math.cos(j*2.4)*.28,h+.6+j*.13,z+Math.sin(j*2.4)*.25],greens[(i+j)%4],[1.25,.7,1]);
  }
});
await save('birch-tree',g=>{
  const pale=mat('birch-bark','#e2ded0'); branch(g,[0,0,0],[.12,3.9,0],.13,.035,pale);
  for(let i=0;i<7;i++) { const a=i*2.4,x=Math.cos(a)*.75,z=Math.sin(a)*.75,h=2+i*.22; branch(g,[.08,h-.6,0],[x,h,z],.04,.012,pale);ball(g,.70,[x,h+.3,z],greens[i%4],[.8,1.2,.85]); }
});
await save('lavender-bed',g=>{
  box(g,[3.6,.35,1.1],[0,.175,0],stone);box(g,[3.4,.04,.91],[0,.35,0],mat('soil','#504535'));
  const purple=mat('lavender','#9e8daa');
  for(let i=0;i<20;i++) { const x=-1.55+(i%10)*.34,z=-.23+Math.floor(i/10)*.45;ball(g,.21,[x,.51,z],greens[1],[1,.75,1]);
    for(let j=0;j<4;j++) { const dx=Math.cos(j*2.4)*.12,dz=Math.sin(j*2.4)*.12,h=.78+(i+j)%3*.07;branch(g,[x,.43,z],[x+dx,h,z+dz],.008,.004,greens[2]);ball(g,.045,[x+dx,h,z+dz],purple,[.75,2.8,.75]); }
  }
});
await save('fern-planter',g=>{
  mesh(g,new THREE.CylinderGeometry(.32,.23,.46,20),clay,[0,.23,0]);
  for(let i=0;i<10;i++) {const a=i*Math.PI/5;for(let j=0;j<5;j++) {const r=.12+j*.10,h=.60+Math.sin(j/5*Math.PI)*.35;const leaf=ball(g,.09,[Math.cos(a)*r,h,Math.sin(a)*r],greens[i%4],[2.3,.28,1]);leaf.rotation.y=-a;}}
});
await save('river-rocks',g=>{for(let i=0;i<7;i++)ball(g,.25+i%3*.10,[Math.cos(i*2.4)*.65,.12,Math.sin(i*2.4)*.43],mat(`rock-${i}`,[ '#959b91','#b0ad9e','#8c9188'][i%3]),[1.4,.65,1]);});
await save('garden-bench',g=>{
  for(let i=0;i<5;i++)box(g,[2.5,.075,.11],[0,.58,-.30+i*.15],oak);
  for(let i=0;i<4;i++)box(g,[2.5,.11,.07],[0,.83+i*.16,-.4],oak);
  for(const x of [-.97,.97]) { box(g,[.07,.56,.70],[x,.28,0],dark);box(g,[.06,1,.07],[x,.75,-.4],dark);box(g,[.10,.05,.55],[x,.87,-.05],dark); }
});
await save('pergola',g=>{
  for(const x of [-2.8,2.8])for(const z of [-1.9,1.9])box(g,[.16,3.2,.16],[x,1.6,z],oak);
  for(const z of [-1.9,1.9])box(g,[6.2,.22,.16],[0,3.15,z],oak);
  for(let i=0;i<12;i++)box(g,[.10,.18,4.5],[-2.9+i*.53,3.30,0],oak);
  for(let i=0;i<18;i++)ball(g,.32,[-2.8+i*.33,3.40,-1.9],greens[i%4],[1,.35,1]);
});
await save('birdbath',g=>{
  mesh(g,new THREE.CylinderGeometry(.20,.32,.9,18),stone,[0,.45,0]);
  mesh(g,new THREE.CylinderGeometry(.60,.45,.14,28),stone,[0,.92,0]);
  mesh(g,new THREE.CylinderGeometry(.50,.50,.008,28),mat('water','#729b9a',{metalness:.3,roughness:.25}),[0,1,0]);
});
await save('outdoor-table',g=>{
  mesh(g,new THREE.CylinderGeometry(.85,.85,.08,28),oak,[0,.78,0]);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;branch(g,[Math.cos(a)*.4,0,Math.sin(a)*.4],[Math.cos(a)*.25,.75,Math.sin(a)*.25],.04,.04,dark);}
});
