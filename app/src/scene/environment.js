import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DESKS, activeLayout } from '../simulation/layout.js';
import { expand } from '../simulation/layouts.js';
import { buildStudioDetails } from './studioDetails.js';
import { buildGarden } from './garden.js';
import { buildArchitecture } from './architecture.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function mat(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options }); }
function box(parent, size, position, color, radius = 0.05, options = {}) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) / 2)), mat(color, options));
  mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function sign(parent, text, subtext, position, size = [3.5, 1.3]) {
  const texture = canvasTexture(1024, 384, (ctx, w, h) => {
    ctx.fillStyle = '#eee5d5'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#374841';
    ctx.font = '600 72px sans-serif'; ctx.fillText(text, w / 2, 162);
    ctx.font = '24px monospace'; ctx.fillStyle = '#788072'; ctx.fillText(subtext, w / 2, 240);
    ctx.fillStyle = '#5c9974'; ctx.beginPath(); ctx.arc(w / 2, 303, 7, 0, Math.PI * 2); ctx.fill();
  });
  const group = new THREE.Group(); group.position.set(...position); parent.add(group);
  box(group, [size[0] + 0.12, size[1] + 0.12, 0.09], [0, 0, 0], '#b0845b');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.90 }));
  board.position.z = 0.053; group.add(board); return texture;
}
function floorText(parent, text, position, width) {
  const texture = canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.textAlign = 'center'; ctx.font = '600 40px monospace'; ctx.fillStyle = '#615446';
    ctx.fillText(text, w / 2, 80);
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.75 }));
  plane.rotation.x = -Math.PI / 2; plane.position.set(...position); plane.userData.ignorePick = true; parent.add(plane); return texture;
}
export async function buildEnvironment(scene, library, disposed = () => false) {
  const root = new THREE.Group(); root.name = 'studio-environment'; scene.add(root);
  const textures = [];
  const loader = new THREE.TextureLoader();
  const [wood, paving] = await Promise.all([
    loader.loadAsync(`${import.meta.env.BASE_URL}textures/pale-oak-v1.png`),
    loader.loadAsync(`${import.meta.env.BASE_URL}textures/limestone-courtyard-v1.png`),
  ]);
  for (const texture of [wood, paving]) { texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; textures.push(texture); }
  wood.repeat.set(4, 3); paving.repeat.set(5, 3);
  const layout = activeLayout();
  const [FW, FD] = layout.floor;

  // One continuous place. The office floor is a patch of a much larger ground
  // that runs past the frame in every direction, so panning finds more world
  // rather than the edge of a slab sitting in the dark.
  const GROUND = 1000;
  const lawn = canvasTexture(512, 512, (ctx, w, h) => {
    let seed=8237;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    ctx.fillStyle='#758d59';ctx.fillRect(0,0,w,h);
    for(let i=0;i<35;i++) {
      const x=random()*w,y=random()*h,r=30+random()*60;
      const glow=ctx.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,i%2?'#9eb16b24':'#405a3620');glow.addColorStop(1,'#758d5900');
      ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<15000;i++) {
      const x=random()*w,y=random()*h;
      ctx.strokeStyle=['#9aac71','#657e48','#82985c','#5e7847'][i%4];ctx.globalAlpha=.24+random()*.24;
      ctx.lineWidth=.5+random()*.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*2-1,y-1-random()*4);ctx.stroke();
    }
    ctx.globalAlpha=1;
  });
  lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping; lawn.repeat.set(35, 35); textures.push(lawn);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshStandardMaterial({ map: lawn, color: '#c2c7aa', roughness: 1 }),
  );
  grass.name = 'campus-ground';
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  grass.receiveShadow = true;
  grass.userData.ignorePick = true;
  root.add(grass);

  // The office floor, flush with the ground rather than raised on a plinth.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FW, FD),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.94 }),
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04;
  floor.receiveShadow = true; floor.userData.floor = true; root.add(floor);
  // A low kerb so the floor reads as a place rather than a rug.
  box(root, [FW + 0.5, 0.16, 0.22], [0, 0.02, FD / 2 + 0.1], '#cdb79c');

  buildArchitecture(root, layout);
  for (const [text, at, width] of layout.labels) textures.push(floorText(root, text, at, width));
  const jobs = [];
  const prop = (name, position, rotation = 0, scale = 1, pick = {}) => {
    jobs.push(library.prop(name).then(model => {
      if (disposed()) return;
      model.position.set(...position); model.rotation.y = rotation;
      Array.isArray(scale) ? model.scale.set(...scale) : model.scale.setScalar(scale);
      model.userData = { ...model.userData, ...pick }; root.add(model);
    }));
  };
  // The whole workstation is mirrored about its own centre so the chair, and
  // therefore the person, ends up on the far side facing the camera. The
  // monitor turns with it, or they would be looking at its back.
  for (const d of DESKS) {
    const [x, z] = d.position;
    // Mirror an offset that used to be measured from the near side.
    const at = (dx, y, dz) => [x - dx, y, z - dz];
    // Shared woven rugs are added with the architectural details.
    const pick = { deskIndex: d.index };
    prop('studio/oak-workstation', [x, 0, z], Math.PI, 1, pick);
    prop('studio/desk-lamp', at(0.98, 1.125, -0.28), Math.PI, 0.78, pick);
    const pad = box(root, [1.2, 0.008, 0.53], at(0, 1.124, 0.18), '#5d7266', 0.035); pad.userData = pick;
    prop('office-floor/chair', [x, 0, z - 0.94], 0, 1, pick);
    prop('office-floor/monitor-on', at(0, 1.12, -0.19), Math.PI, 1, pick);
    prop('office-floor/keyboard', at(0, 1.12, 0.22), Math.PI, 1, pick);
    prop('shared/desk-plant', at(-0.68, 1.115, -0.16), Math.PI, 0.84, pick);
    if (d.index % 3 === 0) prop('shared/books', at(0.65, 1.12, -0.10), Math.PI + 0.15, 0.8, pick);
    else prop('coffee-corner/mug', at(0.64, 1.12, 0.22), Math.PI + 0.2, 0.78, pick);
  }
  // The lounge and the bar are placed relative to their anchors, so an
  // arrangement moves a whole cluster by moving one point.
  const { loungeParts, coffeeParts } = expand(layout);
  const cluster = (parts, [ax, az], pick) => {
    for (const [name, [dx, y, dz], yaw, scale, tag] of parts.props) {
      prop(name, [ax + dx, y, az + dz], yaw, scale, tag === 'floor' ? { floor: true } : pick);
    }
  };
  for (const x of [2.4,7.6,12.6]) prop('studio/birch-tree',[x,0,-FD/2-2.3],x*.2,1.05);
  for (const z of [-6.6,-.8]) prop('studio/olive-tree',[-FW/2-2.4,0,z],z*.1,1.1);
  buildGarden(root, layout, { lawn, paving, wood, prop, textures });
  cluster(loungeParts, layout.lounge, { zone: 'rest' });
  cluster(coffeeParts, layout.coffee, { zone: 'coffee' });

  for (const [name, at, yaw, scale] of layout.extras) prop(name, at, yaw, scale);

  const details = buildStudioDetails(root, layout);
  textures.push(...details.textures);
  await Promise.all(jobs);
  return { root, textures, update: details.update };
}
