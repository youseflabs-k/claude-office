import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createProjectNeighborhood } from './projectNeighborhood.js';
import { ModelLibrary } from './ModelLibrary.js';
import { buildEnvironment } from './environment.js';
import { CAMERAS } from '../simulation/layout.js';
import { PHASE_COLORS, PHASE_LABELS } from '../simulation/engine.js';
import { store } from '../store/store.js';
import { activeLayout } from '../simulation/layout.js';

const CLIP = { working: 'typing', walking: 'walk', coffee: 'coffee-sip', resting: 'rest', celebrating: 'celebrate', 'sitting-down': 'sit-down', 'standing-up': 'stand-up', idle: 'idle' };
const targetVector = new THREE.Vector3();
const projectVector = new THREE.Vector3();
const pointVector = new THREE.Vector2();

export class OfficeScene {
  constructor(host, labelsHost) {
    this.host = host; this.labelsHost = labelsHost; this.disposed = false;
    this.agents = new Map(); this.pending = new Set(); this.scene = new THREE.Scene();
    this.raycaster = new THREE.Raycaster(); this.cameraKey = -1; this.elapsed = 0;
    this.camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 140);
    this.camera.position.set(18, 22, 25);
    this.officeOffset = new THREE.Vector3();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x111521, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.88;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D office. Select an agent, then choose Work, Coffee or Rest.');
    this.renderer.domElement.tabIndex = 0; host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.5, 0); this.controls.enableDamping = true; this.controls.dampingFactor = 0.075;
    this.controls.minPolarAngle = 0.07; this.controls.maxPolarAngle = Math.PI * 0.40;
    this.controls.minZoom = 1; this.controls.maxZoom = 7;
    this.controls.screenSpacePanning = true; this.controls.maxTargetRadius = 500;
    // Scroll zooms, drag orbits, and either a right-drag or a two-finger drag
    // pans — the world is bigger than the frame now, so it has to be possible
    // to go and look at a corner of it.
    this.controls.enablePan = true;
    this.controls.panSpeed = 1.1;
    this.controls.zoomSpeed = 1.15;
    this.controls.addEventListener('start', () => { this.cameraTween = null; });
    this.controls.addEventListener('change', () => {
      if (performance.now() - (this.lastZoomReport ?? 0) > 250) {
        this.lastZoomReport = performance.now(); store.setUI({ zoom: Math.round(this.camera.zoom * 100) });
      }
    });
    this.applySky('sunset');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment(); this.environmentTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture; this.scene.environmentIntensity = 0.55;
    room.dispose(); pmrem.dispose();
    this.sun = new THREE.DirectionalLight('#ffe1b6', 1.8); this.sun.position.set(-10, 13, 7);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 40 });
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.025; this.sun.shadow.radius = 4;
    this.scene.add(this.sun);
    this.fill = new THREE.HemisphereLight('#c6d8ff', '#b78a67', 1.0); this.scene.add(this.fill);
    this.coffeeLight = new THREE.PointLight('#ffc376', 12, 7, 2); this.coffeeLight.position.set(-6.2, 3.2, -3.6); this.scene.add(this.coffeeLight);
    this.loungeLight = new THREE.PointLight('#ffd29a', 7, 6, 2); this.loungeLight.position.set(-7.2, 2.7, 3.8); this.scene.add(this.loungeLight);
    this.library = new ModelLibrary(import.meta.env.BASE_URL, (loaded, requested) => {
      if (!this.disposed) store.setUI({ loadProgress: Math.min(95, Math.round(loaded / Math.max(1, requested) * 95)) });
    });
    this.pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#3ddc97', dashSize: 0.15, gapSize: 0.12, transparent: true, opacity: 0.85, depthTest: false }));
    this.pathLine.renderOrder = 20; this.pathLine.userData.ignorePick = true; this.scene.add(this.pathLine);
    this.destination = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 40), new THREE.MeshBasicMaterial({ color: '#3ddc97', side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    this.destination.rotation.x = -Math.PI / 2; this.destination.userData.ignorePick = true; this.destination.visible = false; this.scene.add(this.destination);
    this.bindEvents();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.setView('studio', true);
    this.previous = performance.now(); this.frame = this.frame.bind(this); this.raf = requestAnimationFrame(this.frame);
    this.initialize();
  }
  async initialize() {
    try {
      const [env] = await Promise.all([
        buildEnvironment(this.scene, this.library, () => this.disposed),
        ...store.getSnapshot().world.agents.map(a => this.addAgent(a))
      ]);
      this.environment = env;
      if (!this.disposed) this.neighborhood = createProjectNeighborhood(this.scene, activeLayout(), env);
      if (!this.disposed) store.setUI({ ready: true, loadProgress: 100 });
    } catch (error) {
      console.error(error);
      if (!this.disposed) store.setUI({ sceneError: error.message, ready: false });
    }
  }
  async addAgent(agent) {
    if (this.pending.has(agent.id) || this.agents.has(agent.id)) return;
    this.pending.add(agent.id);
    try {
      const character = await this.library.character(agent.archetype);
      const { model } = character; const clips = character.clips.slice();
      if (this.disposed || !store.getSnapshot().world.agents.some(a => a.id === agent.id)) return;
      const group = new THREE.Group(); group.name = agent.id; group.userData.agentId = agent.id;
      group.position.set(agent.position[0], 0, agent.position[1]).add(this.officeOffset); group.rotation.y = agent.facing; group.add(model);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.54, 48), new THREE.MeshBasicMaterial({ color: '#3ddc97', side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.014; ring.userData.ignorePick = true; group.add(ring);
      const book = new THREE.Group(); book.position.set(0, 1.03, 0.39); book.rotation.x = -0.45; book.visible = false;
      for (const side of [-1, 1]) {
        const page = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.27), new THREE.MeshStandardMaterial({ color: '#eee3c9', roughness: 1 }));
        page.position.x = side * 0.095; page.rotation.z = side * 0.16; book.add(page);
        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.016, 0.29), new THREE.MeshStandardMaterial({ color: '#90664c', roughness: 0.9 }));
        cover.position.set(side * 0.10, -0.023, 0); cover.rotation.z = side * 0.16; book.add(cover);
      }
      group.add(book);
      const mixer = new THREE.AnimationMixer(model);
      const restClip = clips.find(c => c.name === 'rest');
      if (restClip) {
        const raised = ['r_sleeve','r_forearm','r_hand','r_thumb'];
        const tracks = restClip.tracks.filter(t => !raised.some(n => t.name.startsWith(n + '.'))).map(t => t.clone());
        for (const [name,position] of [['r_sleeve',[.405,0,1.50]],['r_forearm',[.43,0,1.79]],['r_hand',[.43,0,2.00]],['r_thumb',[.36,0,1.98]]]) {
          if (!model.getObjectByName(name)) continue;
          tracks.push(new THREE.VectorKeyframeTrack(name+'.position',[0,2],[...position,...position]));
          tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',[0,2],[0,0,0,1,0,0,0,1]));
        }
        clips.push(new THREE.AnimationClip('attention',2,tracks));
      }
      const actions = Object.fromEntries(clips.map(c => [c.name, mixer.clipAction(c)]));
      const label = document.createElement('button'); label.type = 'button'; label.className = 'world-label';
      const speech = document.createElement('span'); speech.className = 'world-speech';
      const name = document.createElement('span'); name.className = 'world-name';
      const status = document.createElement('span'); status.className = 'world-status';
      label.append(speech, name, status); label.addEventListener('click', e => { e.stopPropagation(); store.select(agent.id); });
      label.addEventListener('dblclick', e => { e.stopPropagation(); store.select(agent.id); store.watch(agent.id); });
      this.labelsHost.appendChild(label); this.scene.add(group);
      this.agents.set(agent.id, { archetype: agent.archetype, group, model, book, mixer, actions, ring, label, speech, name, status, currentClip: null, phase: null });
    } catch (error) { if (!this.disposed) store.notify(error.message, 'error'); }
    finally { this.pending.delete(agent.id); }
  }
  removeAgent(id) {
    const agent = this.agents.get(id); if (!agent) return;
    agent.mixer.stopAllAction(); agent.mixer.uncacheRoot(agent.model);
    agent.book.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    agent.label.remove(); this.scene.remove(agent.group); agent.ring.geometry.dispose(); agent.ring.material.dispose();
    this.agents.delete(id);
  }
  switchAnimation(view, phase) {
    if (view.phase === phase) return;
    const clipName = phase === 'attention' ? 'attention' : CLIP[phase] ?? 'idle', next = view.actions[clipName] ?? view.actions.idle;
    if (!next) return;
    const previous = view.currentClip;
    next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
    const once = phase === 'sitting-down' || phase === 'standing-up';
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    if (previous && previous !== next) previous.fadeOut(0.22);
    next.fadeIn(0.22).play(); view.currentClip = next; view.phase = phase;
  }
  frame(now) {
    if (this.disposed) return;
    const dt = Math.min((now - this.previous) / 1000, 0.05); this.previous = now;
    const state = store.getSnapshot(); this.elapsed += state.paused ? 0 : dt * state.settings.speed;
    if (this.neighborhood) {
      this.officeOffset.copy(this.neighborhood.update(state.workspaces.projects, state.world.projectId));
      const campusKey = state.workspaces.projects.map(p => p.id).join('|');
      if (campusKey !== this.campusKey) { this.campusKey = campusKey; this.setView(state.view, true); }
      this.sun.position.set(-10, 13, 7).add(this.officeOffset);
      this.sun.target.position.copy(this.officeOffset); this.sun.target.updateMatrixWorld();
      this.coffeeLight.position.set(-6.2, 3.2, -3.6).add(this.officeOffset);
      this.loungeLight.position.set(-7.2, 2.7, 3.8).add(this.officeOffset);
      this.updateFrustum();
    }
    if (state.cameraRequest.key !== this.cameraKey) {
      this.cameraKey = state.cameraRequest.key; const request = state.cameraRequest;
      if (request.kind === 'view') this.setView(request.view);
      if (request.kind === 'focus') {
        const a = state.world.agents.find(a => a.id === request.agentId);
        if (a) this.setCamera({ target: [a.position[0], 0.85, a.position[1]], position: [a.position[0] + 8, 10, a.position[1] + 12], size: 7 });
      }
      if (request.kind === 'zoom') { this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + request.amount, this.controls.minZoom, this.controls.maxZoom); this.camera.updateProjectionMatrix(); }
    }
    if (this.cameraTween) {
      const t = Math.min(1, (now - this.cameraTween.start) / 780), ease = 1 - (1 - t) ** 3;
      this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.position, ease);
      this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.target, ease);
      this.viewSize = THREE.MathUtils.lerp(this.cameraTween.fromSize, this.cameraTween.size, ease); this.updateFrustum();
      if (t >= 1) this.cameraTween = null;
    }
    this.controls.update();
    if (this.neighborhood) {
      const bounds = this.neighborhood.bounds();
      const target = this.controls.target.clone();
      this.controls.target.x = THREE.MathUtils.clamp(target.x, bounds.min.x, bounds.max.x);
      this.controls.target.z = THREE.MathUtils.clamp(target.z, bounds.min.z, bounds.max.z);
      this.controls.target.y = THREE.MathUtils.clamp(target.y, 0, 6);
      this.camera.position.add(this.controls.target.clone().sub(target));
    }
    this.environment?.update(this.elapsed, state.settings.theme === 'night');
    this.updateTheme(state.settings.theme); this.updateQuality(state.settings.quality);
    const ids = new Set(state.world.agents.map(a => a.id));
    for (const id of this.agents.keys()) if (!ids.has(id)) this.removeAgent(id);
    for (const agent of state.world.agents) {
      let view = this.agents.get(agent.id);
      if (view && view.archetype !== agent.archetype) { this.removeAgent(agent.id); view = null; }
      if (!view) { this.addAgent(agent); continue; }
      this.switchAnimation(view, agent.needsYou && agent.phase === 'resting' && agent.slotId?.startsWith('desk-') ? 'attention' : agent.phase);
      view.book.visible = agent.phase === 'resting' && agent.leisure === 'reading';
      if (!state.paused) view.mixer.update(dt * state.settings.speed);
      targetVector.set(agent.position[0], 0, agent.position[1]).add(this.officeOffset); view.group.position.lerp(targetVector, 1 - Math.exp(-dt * 22));
      const current = view.group.rotation.y, difference = Math.atan2(Math.sin(agent.facing - current), Math.cos(agent.facing - current));
      view.group.rotation.y += difference * (1 - Math.exp(-dt * 14));
      const selected = state.selectedId === agent.id;
      view.ring.visible = selected; view.ring.scale.setScalar(1 + 0.03 * Math.sin(this.elapsed * 3));
      view.label.classList.toggle('selected', selected); view.label.dataset.phase = agent.needsYou && agent.phase === 'resting' && agent.slotId?.startsWith('desk-') ? 'attention' : agent.phase;
      view.name.textContent = agent.name; view.status.textContent = agent.needsYou ? 'Needs you' : view.book.visible ? 'Reading' : agent.phase === 'resting' && agent.area === 'garden' ? 'Garden break' : agent.phase === 'resting' && agent.leisure === 'desk-rest' ? 'Resting at desk' : agent.phase === 'walking' && agent.freeToRoam ? 'Taking a walk' : PHASE_LABELS[agent.phase];
      view.label.style.setProperty('--agent-color', agent.color); view.label.style.setProperty('--state-color', PHASE_COLORS[agent.phase]);
      view.label.setAttribute('aria-label', `Select ${agent.name}, ${agent.needsYou ? 'Needs you' : PHASE_LABELS[agent.phase]}`);
      view.speech.textContent = agent.speech; view.speech.hidden = !agent.speech;
      projectVector.copy(view.group.position).add(targetVector.set(0, 2.45, 0)).project(this.camera);
      const visible = (state.settings.labels || selected || agent.needsYou) && projectVector.z < 1 && Math.abs(projectVector.x) < 1.13 && Math.abs(projectVector.y) < 1.12;
      view.label.hidden = !visible;
      view.label.style.transform = `translate(-50%, -100%) translate(${(projectVector.x * 0.5 + 0.5) * this.width}px, ${(-projectVector.y * 0.5 + 0.5) * this.height}px)`;
      view.label.style.zIndex = String(Math.round((1 - projectVector.z) * 100));
    }
    const selected = state.world.agents.find(a => a.id === state.selectedId);
    if (selected?.path.length && (this.pathWorld !== state.world || this.pathSelection !== state.selectedId)) {
      this.pathWorld = state.world; this.pathSelection = state.selectedId;
      const points = [selected.position, ...selected.path].map(p => new THREE.Vector3(p[0], 0.035, p[1]).add(this.officeOffset));
      this.pathLine.geometry.dispose(); this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points); this.pathLine.computeLineDistances(); this.pathLine.visible = true;
      const end = selected.path.at(-1); this.destination.position.set(end[0], 0.028, end[1]).add(this.officeOffset); this.destination.visible = true;
    } else if (!selected?.path.length) { this.pathLine.visible = this.destination.visible = false; this.pathWorld = null; }
    if (!document.hidden) this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  }
  updateTheme(theme) {
    if (this.theme === theme) return; this.theme = theme;
    const night = theme === 'night'; this.sun.color.set(night ? '#adc7ff' : '#ffe1b6'); this.sun.intensity = night ? 0.7 : 1.8;
    this.fill.intensity = night ? 0.48 : 1.0; this.scene.environmentIntensity = night ? 0.27 : 0.42;
    this.coffeeLight.intensity = night ? 25 : 12; this.loungeLight.intensity = night ? 18 : 7;
    this.renderer.toneMappingExposure = night ? 0.86 : 0.88;
    this.applySky(theme);
  }
  updateQuality(quality) {
    if (this.quality === quality) return; this.quality = quality;
    const level = quality === 'high' ? 2048 : quality === 'low' ? 512 : 1024;
    this.sun.shadow.mapSize.set(level, level); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.4));
    this.renderer.setSize(this.width, this.height, false);
  }
  /** Daylight behind the world, and haze where it meets the horizon. */
  applySky(theme) {
    const night = theme === 'night';
    const top = night ? '#111a30' : '#9fc4e8';
    const horizon = night ? '#243357' : '#e8d6bd';

    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.62, night ? '#1b2542' : '#cfdcea');
    gradient.addColorStop(1, horizon);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
    if (!night) {
      for (let i = 0; i < 7; i++) {
        const x = (i * 173 + 80) % 1024, y = 75 + i % 3 * 55;
        const cloud = ctx.createRadialGradient(x, y, 8, x, y, 110);
        cloud.addColorStop(0, '#ffffff55'); cloud.addColorStop(1, '#ffffff00');
        ctx.fillStyle = cloud; ctx.save(); ctx.translate(0, y * 0.5); ctx.scale(1, 0.5); ctx.fillRect(x - 130, y - 130, 260, 260); ctx.restore();
      }
    } else {
      ctx.fillStyle = '#e8e9df';
      for (let i = 0; i < 70; i++) { const x = (i * 157) % 1024, y = (i * 83) % 320; ctx.globalAlpha = 0.25 + i % 4 * 0.15; ctx.fillRect(x, y, 1.5, 1.5); }
      ctx.globalAlpha = 1;
    }

    this.skyTexture?.dispose();
    this.skyTexture = new THREE.CanvasTexture(canvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTexture;
    // Haze hides where the ground plane stops, so the world reads as going on.
    this.scene.fog = new THREE.Fog(horizon, 78, 165);
  }

  setView(view, instant = false) {
    // Studio and top show the whole world, so they are framed to it; the area
    // views are deliberate close-ups and keep their own size.
    if (view === 'garden') {
      const z = activeLayout().floor[1] / 2 + 5;
      this.setCamera({ position: [13, 17, z + 19], target: [0, 1, z + 1], size: Math.max(17, 25 / (this.width / this.height)) }, instant); return;
    }
    if (view === 'neighbors') {
      const bounds = this.neighborhood?.bounds() ?? new THREE.Box3(new THREE.Vector3(-15, 0, -10), new THREE.Vector3(15, 6, 25));
      const center = bounds.getCenter(new THREE.Vector3());
      this.setCamera({ target: center.toArray(), position: center.clone().add(new THREE.Vector3(view === 'top' ? 0 : 12, 45, view === 'top' ? 0.01 : 55)).toArray(), size: 35 }, instant, { fit: true, campus: true }); return;
    }
    const fit = view === 'studio' || view === 'top';
    this.setCamera(CAMERAS[view] ?? CAMERAS.studio, instant, { fit });
  }
  setCamera(config, instant = false, { fit = false, campus = false } = {}) {
    // The wide views frame whatever the world currently is; the area close-ups
    // and agent focus keep the size they were given.
    this.fitWorld = fit; this.fitCampus = campus;
    if (!campus) config = { ...config, target: new THREE.Vector3(...config.target).add(this.officeOffset).toArray(), position: new THREE.Vector3(...config.position).add(this.officeOffset).toArray() };
    this.camera.zoom = 1; this.camera.updateProjectionMatrix();
    if (instant) {
      this.viewSize = config.size; this.camera.position.set(...config.position); this.controls.target.set(...config.target); this.controls.update(); this.updateFrustum(); return;
    }
    this.cameraTween = { start: performance.now(), fromPosition: this.camera.position.clone(), fromTarget: this.controls.target.clone(),
      fromSize: this.viewSize, position: new THREE.Vector3(...config.position), target: new THREE.Vector3(...config.target), size: config.size };
  }
  /** The vertical extent needed to hold the whole world at this camera angle.
   *
   * Measured rather than guessed: the floor's corners are projected into
   * camera space and the frustum is sized to the result. A single hand-tuned
   * number cannot fill both a wide short panel and a whole window, and it
   * would have to be retuned for every arrangement.
   */
  worldExtent(aspect) {
    const [FW, FD] = activeLayout().floor;
    const bounds = this.fitCampus && this.neighborhood ? this.neighborhood.bounds() : new THREE.Box3(new THREE.Vector3(-FW / 2, -0.6, -FD / 2).add(this.officeOffset), new THREE.Vector3(FW / 2, 3.9, FD / 2).add(this.officeOffset));
    const view = new THREE.Matrix4().lookAt(
      this.camera.position, this.controls.target, this.camera.up,
    ).invert();

    let maxX = 0, maxY = 0;
    const corner = new THREE.Vector3();
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          corner.set(x, y, z).sub(this.controls.target).applyMatrix4(view);
          maxX = Math.max(maxX, Math.abs(corner.x));
          maxY = Math.max(maxY, Math.abs(corner.y));
        }
      }
    }
    // Whichever side runs out first decides, so nothing is ever cut off. The
    // margin leaves the garden and the neighbours showing at the edges, which
    // is the point of a world rather than a room.
    return Math.max(maxY * 2, (maxX * 2) / aspect) * 1.12;
  }

  updateFrustum() {
    const aspect = this.width / Math.max(1, this.height);
    // The wide views frame the whole world; the close-ups keep their own size.
    const size = this.fitWorld ? this.worldExtent(aspect) : (this.viewSize ?? 25);
    const width = size * aspect;
    this.camera.left = -width / 2; this.camera.right = width / 2;
    this.camera.top = width / aspect / 2; this.camera.bottom = -width / aspect / 2; this.camera.updateProjectionMatrix();
  }
  resize() {
    this.width = Math.max(1, this.host.clientWidth); this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false); this.updateFrustum();
  }
  pick(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    pointVector.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(pointVector, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
      let node = hit.object, data = {}, ignored = false;
      while (node) { if (node.userData.ignorePick) ignored = true; Object.assign(data, node.userData); node = node.parent; }
      if (ignored) continue;
      if (data.agentId || data.zone || data.deskIndex != null || data.floor) return { data, point: [hit.point.x - this.officeOffset.x, hit.point.z - this.officeOffset.z] };
    }
    return null;
  }
  bindEvents() {
    const canvas = this.renderer.domElement;
    this.onDown = e => { this.down = [e.clientX, e.clientY, e.button]; };
    this.onUp = e => {
      if (!this.down || this.down[2] !== 0 || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5) return;
      const hit = this.pick(e); if (!hit) return;
      if (hit.data.agentId) {
        store.select(hit.data.agentId);
        return;
      }
      if (hit.data.deskIndex != null) { store.assignDesk(hit.data.deskIndex); return; }
      if (hit.data.zone) { store.command(hit.data.zone); return; }
      if (store.getSnapshot().tool === 'move' || e.shiftKey) store.command('move', hit.point);
    };
    this.onDoubleClick = e => {
      const hit = this.pick(e);
      if (hit?.data.agentId) { store.select(hit.data.agentId); store.watch(hit.data.agentId); }
    };
    this.onMove = e => {
      if (e.buttons) return;
      const hit = this.pick(e); canvas.style.cursor = hit && (hit.data.agentId || hit.data.zone || hit.data.deskIndex != null) ? 'pointer' : store.getSnapshot().tool === 'move' ? 'crosshair' : 'grab';
    };
    this.onLost = e => { e.preventDefault(); store.setUI({ sceneError: 'The graphics context was lost. Reload the page, or choose a lower graphics quality.' }); };
    canvas.addEventListener('dblclick', this.onDoubleClick); canvas.addEventListener('pointerdown', this.onDown); canvas.addEventListener('pointerup', this.onUp); canvas.addEventListener('pointermove', this.onMove); canvas.addEventListener('webglcontextlost', this.onLost);
  }
  dispose() {
    this.skyTexture?.dispose();
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('dblclick', this.onDoubleClick); canvas.removeEventListener('pointerdown', this.onDown); canvas.removeEventListener('pointerup', this.onUp); canvas.removeEventListener('pointermove', this.onMove); canvas.removeEventListener('webglcontextlost', this.onLost);
    for (const id of [...this.agents.keys()]) this.removeAgent(id);
    this.neighborhood?.dispose();
    this.environment?.textures.forEach(texture => texture.dispose());
    this.scene.traverse(o => {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose();
    });
    this.environmentTarget.dispose(); this.sun.shadow.map?.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.library.dispose();
  }
}
