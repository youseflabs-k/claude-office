import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** The source GLB geometry/materials are shared; animated node trees are cloned.
 * Furniture is batched by material inside each prop to reduce draw calls.
 */
export class ModelLibrary {
  constructor(baseURL, onProgress = () => {}) {
    this.baseURL = baseURL; this.onProgress = onProgress;
    this.loader = new GLTFLoader(); this.cache = new Map(); this.staticCache = new Map();
    this.loaded = 0; this.requested = 0;
  }
  async load(path) {
    if (!this.cache.has(path)) {
      this.requested++;
      this.cache.set(path, this.loader.loadAsync(`${this.baseURL}models/${path}.glb`).then(gltf => {
        gltf.scene.traverse(o => {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.roughness = 0.85; }
        });
        this.loaded++; this.onProgress(this.loaded, this.requested); return gltf;
      }).catch(error => { this.cache.delete(path); throw new Error(`Could not load ${path}: ${error.message}`); }));
    }
    return this.cache.get(path);
  }
  async character(id) {
    const gltf = await this.load(`characters/${id}`);
    return { model: gltf.scene.clone(true), clips: gltf.animations };
  }
  async prop(path) {
    if (!this.staticCache.has(path)) {
      this.staticCache.set(path, this.load(`furniture/${path}`).then(gltf => {
        gltf.scene.updateMatrixWorld(true);
        const buckets = new Map();
        gltf.scene.traverse(o => {
          if (!o.isMesh) return;
          const material = o.material;
          const key = `${material.color?.getHexString()}|${material.roughness}|${material.metalness}|${material.opacity}`;
          if (!buckets.has(key)) buckets.set(key, { material, geometries: [] });
          buckets.get(key).geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
        });
        const group = new THREE.Group();
        for (const bucket of buckets.values()) {
          const merged = mergeGeometries(bucket.geometries, false);
          if (merged) {
            const mesh = new THREE.Mesh(merged, bucket.material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
          } else for (const geometry of bucket.geometries) {
            const mesh = new THREE.Mesh(geometry, bucket.material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
          }
          if (merged) bucket.geometries.forEach(g => g.dispose());
        }
        return group;
      }));
    }
    return (await this.staticCache.get(path)).clone(true);
  }
  async dispose() {
    const disposedGeometry = new Set(), disposedMaterial = new Set();
    const clean = object => object.traverse(o => {
      if (o.geometry && !disposedGeometry.has(o.geometry)) { disposedGeometry.add(o.geometry); o.geometry.dispose(); }
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of materials) if (material && !disposedMaterial.has(material)) {
        disposedMaterial.add(material); material.dispose();
      }
    });
    for (const promise of this.cache.values()) try { clean((await promise).scene); } catch { /* failed asset already reported */ }
    for (const promise of this.staticCache.values()) try { clean(await promise); } catch { /* failed asset */ }
    this.cache.clear(); this.staticCache.clear();
  }
}
