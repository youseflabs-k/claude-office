import * as THREE from 'three';

/** Every imported project owns a fixed office in a single shared campus. */
export function createProjectNeighborhood(scene, layout, environment) {
  const root = new THREE.Group(); root.name = 'imported-project-studios'; scene.add(root);
  const offices = new Map(), positions = new Map();
  let nextSlot = 0;
  function update(projects, currentId) {
    const ids = new Set(projects.map(p => p.id));
    for (const [id, office] of offices) {
      if (ids.has(id)) continue;
      root.remove(office.group); office.sign.geometry.dispose(); office.sign.material.map.dispose(); office.sign.material.dispose(); offices.delete(id);
    }
    for (const project of projects) {
      if (!positions.has(project.id)) {
        const slot = nextSlot++;
        positions.set(project.id, new THREE.Vector3(slot % 3 * (layout.floor[0] + 7), 0, Math.floor(slot / 3) * (layout.floor[1] + 19)));
      }
      let office = offices.get(project.id);
      const name = String(project.displayName ?? project.name ?? 'Project');
      if (!office) {
        const group = new THREE.Group(); group.userData.officeProjectId = project.id;
        group.position.copy(positions.get(project.id)); root.add(group);
        // GLB geometry and textures are shared by all offices, keeping memory bounded.
        const building = environment.root.clone(true); building.position.set(0, 0, 0);
        const ground = building.getObjectByName('campus-ground'); if (ground) building.remove(ground);
        building.traverse(o => { o.userData = { ignorePick: true }; });
        group.add(building);
        const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
        const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
        sign.position.set(0, 4.9, -layout.floor[1] / 2); sign.userData.ignorePick = true; group.add(sign);
        office = { group, building, sign, name: null }; offices.set(project.id, office);
      }
      if (office.name !== name) {
        const ctx = office.sign.material.map.image.getContext('2d');
        ctx.fillStyle = '#eee5d5'; ctx.fillRect(0, 0, 1024, 192);
        ctx.fillStyle = '#374841'; ctx.textAlign = 'center'; ctx.font = '600 56px sans-serif';
        while (ctx.measureText(name).width > 950) { const size = parseInt(ctx.font.match(/\d+/)[0]); if (size <= 18) break; ctx.font = `600 ${size - 2}px sans-serif`; }
        ctx.fillText(name, 512, 87); ctx.font = '24px sans-serif'; ctx.fillText('PROJECT OFFICE', 512, 143);
        office.sign.material.map.needsUpdate = true; office.name = name;
      }
      office.building.visible = project.id !== currentId;
    }
    const offset = positions.get(currentId) ?? new THREE.Vector3();
    environment.root.position.copy(offset);
    return offset;
  }
  function bounds() {
    const result = new THREE.Box3();
    for (const { group } of offices.values()) {
      result.expandByPoint(group.position.clone().add(new THREE.Vector3(-layout.floor[0] / 2 - 1, 0, -layout.floor[1] / 2 - 1)));
      result.expandByPoint(group.position.clone().add(new THREE.Vector3(layout.floor[0] / 2 + 1, 6, layout.floor[1] / 2 + 15)));
    }
    return result.isEmpty() ? new THREE.Box3(new THREE.Vector3(-layout.floor[0] / 2 - 1, 0, -layout.floor[1] / 2 - 1), new THREE.Vector3(layout.floor[0] / 2 + 1, 6, layout.floor[1] / 2 + 15)) : result;
  }
  return { update, bounds, dispose() {
    // Building resources belong to the original environment and ModelLibrary.
    for (const { sign } of offices.values()) { sign.geometry.dispose(); sign.material.map.dispose(); sign.material.dispose(); }
    scene.remove(root); offices.clear();
  } };
}
