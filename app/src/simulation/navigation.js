import { BOUNDS, OBSTACLES } from './layout.js';
export const CELL = 0.25;
export const CLEARANCE = 0.23;
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerpPoint = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function isWalkable(point, obstacles = OBSTACLES, clearance = CLEARANCE) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return false;
  const [x, z] = point;
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return false;
  return !obstacles.some(o => Math.abs(x - o.x) < o.halfX + clearance && Math.abs(z - o.z) < o.halfZ + clearance);
}
const key = (x, z) => `${x},${z}`;
const toCell = p => [Math.round((p[0] - BOUNDS.minX) / CELL), Math.round((p[1] - BOUNDS.minZ) / CELL)];
const toWorld = c => [BOUNDS.minX + c[0] * CELL, BOUNDS.minZ + c[1] * CELL];
export function nearestWalkable(point, obstacles = OBSTACLES) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return null;
  const origin = toCell(point);
  for (let ring = 0; ring <= 12; ring++) {
    const candidates = [];
    for (let x = -ring; x <= ring; x++) for (let z = -ring; z <= ring; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
      const p = toWorld([origin[0] + x, origin[1] + z]);
      if (isWalkable(p, obstacles)) candidates.push(p);
    }
    if (candidates.length) return candidates.sort((a, b) => distance(a, point) - distance(b, point))[0];
  }
  return null;
}
export function clearLine(a, b, obstacles = OBSTACLES) {
  if (!isWalkable(a, obstacles) || !isWalkable(b, obstacles)) return false;
  // Exact slab intersection avoids cutting narrow furniture corners between samples.
  for (const o of obstacles) {
    let enter = 0, exit = 1;
    const bounds = [[o.x - o.halfX - CLEARANCE + 1e-7, o.x + o.halfX + CLEARANCE - 1e-7],
      [o.z - o.halfZ - CLEARANCE + 1e-7, o.z + o.halfZ + CLEARANCE - 1e-7]];
    for (let axis = 0; axis < 2; axis++) {
      const delta = b[axis] - a[axis], [lo, hi] = bounds[axis];
      if (Math.abs(delta) < 1e-10) {
        if (a[axis] < lo || a[axis] > hi) { enter = 2; break; }
      } else {
        const t1 = (lo - a[axis]) / delta, t2 = (hi - a[axis]) / delta;
        enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
      }
      if (enter > exit) break;
    }
    if (enter <= exit && enter <= 1 && exit >= 0) return false;
  }
  return true;
}
function connectedGridPoint(point, obstacles) {
  const base = toCell(point);
  for (let ring = 0; ring <= 8; ring++) {
    const options = [];
    for (let x = -ring; x <= ring; x++) for (let z = -ring; z <= ring; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
      const cell = [base[0] + x, base[1] + z], p = toWorld(cell);
      if (clearLine(point, p, obstacles)) options.push({ cell, p });
    }
    if (options.length) return options.sort((a, b) => distance(a.p, point) - distance(b.p, point))[0].cell;
  }
  return null;
}
/** Eight-neighbour A*, with no diagonal corner cutting and visibility smoothing. */
export function findPath(start, goal, obstacles = OBSTACLES) {
  if (!Array.isArray(start) || start.length !== 2 || !start.every(Number.isFinite) || !isWalkable(goal, obstacles)) return null;
  const safeStart = isWalkable(start, obstacles) ? start : nearestWalkable(start, obstacles);
  if (!safeStart) return null;
  if (clearLine(safeStart, goal, obstacles)) return distance(safeStart, goal) < 0.03 ? [] : [goal.slice()];
  const startCell = connectedGridPoint(safeStart, obstacles), endCell = connectedGridPoint(goal, obstacles);
  if (!startCell || !endCell) return null;
  const originKey = key(...startCell), endKey = key(...endCell);
  const open = new Map([[originKey, { cell: startCell, g: 0, f: distance(startCell, endCell), parent: null }]]);
  const closed = new Map();
  let found = null, guard = 0;
  while (open.size && guard++ < 6000) {
    let currentKey, current;
    for (const [k, v] of open) if (!current || v.f < current.f) { currentKey = k; current = v; }
    open.delete(currentKey); closed.set(currentKey, current);
    if (currentKey === endKey) { found = current; break; }
    const [cx, cz] = current.cell;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const cell = [cx + dx, cz + dz], k = key(...cell);
      if (closed.has(k) || !isWalkable(toWorld(cell), obstacles)) continue;
      if (dx && dz && (!isWalkable(toWorld([cx + dx, cz]), obstacles) || !isWalkable(toWorld([cx, cz + dz]), obstacles))) continue;
      const g = current.g + Math.hypot(dx, dz);
      if (open.has(k) && open.get(k).g <= g) continue;
      open.set(k, { cell, g, f: g + distance(cell, endCell), parent: currentKey });
    }
  }
  if (!found) return null;
  const raw = [goal.slice()];
  for (let node = found; node; node = node.parent ? closed.get(node.parent) : null) raw.unshift(toWorld(node.cell));
  const smooth = []; let from = safeStart, i = 0;
  while (i < raw.length) {
    let furthest = i;
    while (furthest + 1 < raw.length && clearLine(from, raw[furthest + 1], obstacles)) furthest++;
    smooth.push(raw[furthest]); from = raw[furthest]; i = furthest + 1;
  }
  return smooth;
}

/** Somewhere nearby worth strolling to.
 *
 * An idle person does not only make trips to the coffee bar; they also just
 * move about. This picks an open point a short walk away and checks a route
 * exists, so the result is somewhere they can actually reach rather than a
 * spot on the far side of a desk.
 */
export function wanderTarget(start, random = Math.random, obstacles = OBSTACLES) {
  for (let i = 0; i < 64; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 1.2 + random() * 3.2;
    const point = [start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius];
    if (isWalkable(point, obstacles) && findPath(start, point, obstacles)) return point;
  }
  return null;
}
