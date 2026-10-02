import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Architectural details stay at the perimeter; circulation belongs to the layout. */
export function buildStudioDetails(root, layout) {
  const textures = [], steam = [], lights = [];
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const oak = material('#a97951'), brass = material('#ad8850', { metalness: 0.65, roughness: 0.32 });
  const cream = material('#f4e7cc'), green = material('#53695d');
  const mesh = (geometry, mat, at) => {
    const m = new THREE.Mesh(geometry, mat); m.position.set(...at);
    m.castShadow = m.receiveShadow = true; m.userData.ignorePick = true; root.add(m); return m;
  };
  const box = (size, at, mat) => mesh(new RoundedBoxGeometry(...size, 2, Math.min(0.035, Math.min(...size) / 3)), mat, at);
  const [w, d] = layout.floor, back = -d / 2 + 0.06;
  // Low joinery and acoustic timber beside the window bays.
  for (let i = 0; i < 12; i++) box([0.055, 3.8, 0.08], [w / 2 - 1.35 + i * 0.10, 2.05, back + 0.12], oak);
  box([4.1, 0.8, 0.50], [-3.0, 0.4, back + 0.36], oak);
  // Original abstract prints, generated locally as crisp canvas textures.
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#eee4ce'; ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = ['#bd7654', '#71826a', '#b69a65'][i];
    ctx.beginPath(); ctx.arc(128, 119, 66, Math.PI, 0); ctx.lineTo(194, 246); ctx.lineTo(62, 246); ctx.fill();
    ctx.fillStyle = '#dfc79f'; ctx.beginPath(); ctx.arc(166, 92, 31, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#344e45'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(45, 267); ctx.quadraticCurveTo(110, 160, 211, 243); ctx.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; textures.push(t);
    const x = layout.coffee[0] - 1.7 + i * 1.7;
    box([1.19, 1.48, 0.08], [x, 2.7, back + 0.08], oak);
    mesh(new THREE.PlaneGeometry(1.08, 1.36), material('#ffffff', { map: t }), [x, 2.7, back + 0.13]);
  }
  // Slim wall sconces and their warm pools of light.
  for (const x of [-13.5, -4.5, 5.0, 10.0]) {
    box([0.12, 0.50, 0.12], [x, 2.65, back + 0.2], brass);
    box([0.24, 0.35, 0.18], [x, 2.67, back + 0.29], material('#ffdfab', { emissive: '#ffba64', emissiveIntensity: 0.65 }));
    const light = new THREE.PointLight('#ffd5a0', 4, 4, 2); light.position.set(x, 2.7, back + 0.7); root.add(light); lights.push(light);
  }
  // Soft woven mats tie each row into a single working area.
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#9caa99'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    ctx.fillStyle = '#ffffff12'; ctx.fillRect(i, 0, 1, 128);
    ctx.fillStyle = '#263b3214'; ctx.fillRect(0, i, 128, 1);
  }
  const weave = new THREE.CanvasTexture(c); weave.colorSpace = THREE.SRGBColorSpace;
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(12, 3); textures.push(weave);
  for (let row = 0; row < 3; row++) {
    const x = layout.desks.x0 + 1.5 * layout.desks.dx, z = layout.desks.z0 + row * layout.desks.dz;
    box([14.5, 0.016, 3.1], [x, -0.018, z - 0.5], material('#d4d6c6', { map: weave }));
  }
  // Floating steam curls give the coffee corner a little life without new routes.
  const [cx, cz] = layout.coffee;
  for (let i = 0; i < 5; i++) {
    const puff = mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff1da', transparent: true, opacity: 0.12, depthWrite: false }), [cx + 0.98, 1.4, cz + 0.25]);
    puff.castShadow = puff.receiveShadow = false; steam.push({ puff, phase: i / 5 });
  }
  const gardenZ = d / 2 + 6;
  // Overhead cafe lights frame the courtyard without enclosing the view.
  const cablePoints = [];
  for (let i = 0; i <= 24; i++) {
    const x = -9 + i * 0.75, y = 3.9 - Math.sin(i / 24 * Math.PI) * 0.7;
    cablePoints.push(new THREE.Vector3(x, y, gardenZ));
    if (i % 2 === 0) mesh(new THREE.SphereGeometry(0.065, 8, 6), material('#ffe8b8', { emissive: '#ffc578', emissiveIntensity: 1.4 }), [x, y - 0.10, gardenZ]);
  }
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cablePoints), new THREE.LineBasicMaterial({ color: '#4c5145' })); root.add(cable);
  for (const x of [-9, 9]) box([0.12, 4, 0.12], [x, 1.95, gardenZ], oak);
  return {
    textures,
    update(time, night) {
      lights.forEach(light => { light.intensity = night ? 7 : 3; });
      steam.forEach(({ puff, phase }) => {
        const t = (time * 0.23 + phase) % 1;
        puff.position.set(cx + 0.98 + Math.sin(t * 7 + phase) * 0.06, 1.36 + t * 0.65, cz + 0.25);
        puff.scale.set(1 + t * 1.8, 1.7 + t * 2, 1 + t); puff.material.opacity = Math.sin(t * Math.PI) * 0.14;
      });
    },
  };
}
