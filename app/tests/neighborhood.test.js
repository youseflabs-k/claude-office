import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProjectNeighborhood } from '../src/scene/projectNeighborhood.js';

test('every imported project has a stable office independent of selected project', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {}, measureText: text => ({ width: text.length * 20 }) }) }) };
  try {
    const scene = new THREE.Scene();
    const environment = { root: new THREE.Group() };
    environment.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const neighborhood = createProjectNeighborhood(scene, { floor: [26, 17] }, environment);
    const projects = [{ id: 'a', displayName: 'Alpha' }, { id: 'b', displayName: 'Beta' }, { id: 'c', displayName: 'Gamma' }];
    neighborhood.update(projects, 'a');
    const root = scene.getObjectByName('imported-project-studios');
    assert.deepEqual(root.children.map(s => s.userData.officeProjectId), ['a', 'b', 'c']);
    const first = root.children[0];
    neighborhood.update(projects, 'a');
    assert.equal(root.children[0], first, 'unchanged frames reuse geometry');
    let disposed = false;
    first.children[1].geometry.addEventListener('dispose', () => { disposed = true; });
    const before = root.children.map(s => s.position.clone());
    neighborhood.update(projects, 'b');
    assert.deepEqual(root.children.map(s => s.userData.officeProjectId), ['a', 'b', 'c']);
    assert.equal(root.children[0], first, 'selection does not rebuild offices');
    assert.deepEqual(root.children.map(s => s.position), before, 'selection never moves buildings');
    assert.equal(disposed, false);
    assert.equal(environment.root.position.x, 33, 'active agents use their own project office');
    neighborhood.update([projects[1]], 'b');
    assert.equal(root.children.length, 1, 'the selected project also keeps its office');
    assert.equal(root.children[0].userData.officeProjectId, 'b');
    assert.ok(disposed, 'removing a project releases its sign');
    neighborhood.update([], null);
    assert.equal(root.children.length, 0);
    neighborhood.dispose();
    assert.equal(scene.children.length, 0);
  } finally { globalThis.document = original; }
});
