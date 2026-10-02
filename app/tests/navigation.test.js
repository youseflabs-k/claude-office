import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, DESKS, OBSTACLES } from '../src/simulation/layout.js';
import { isWalkable, findPath, nearestWalkable, distance, lerpPoint, clearLine } from '../src/simulation/navigation.js';

test('all 21 interaction entry points are navigable', () => {
  assert.equal(SLOTS.length, 21);
  for (const slot of SLOTS) assert.ok(isWalkable(slot.entry), slot.id);
});
test('all 441 directed slot-to-slot routes exist and avoid furniture', () => {
  for (const from of SLOTS) for (const to of SLOTS) {
    const path = findPath(from.entry, to.entry);
    assert.notEqual(path, null, `${from.id} → ${to.id}`);
    let previous = from.entry;
    for (const point of path) {
      assert.ok(clearLine(previous, point), `${from.id} → ${to.id} crosses furniture`);
      const steps = Math.max(1, Math.ceil(distance(previous, point) / 0.04));
      for (let i = 0; i <= steps; i++) assert.ok(isWalkable(lerpPoint(previous, point, i / steps)));
      previous = point;
    }
    assert.ok(distance(previous, to.entry) < 0.031);
  }
});
test('invalid or obstructed floor destinations are rejected', () => {
  for (const p of [null, [], [0], [NaN, 0], [Infinity, 1], ['1', 2], [500, 500], DESKS[0].position]) {
    assert.equal(isWalkable(p), false);
    assert.equal(findPath([-2.5, 4.8], p), null);
  }
  assert.equal(findPath(null, [-2.5, 4.8]), null);
  assert.equal(nearestWalkable(null), null);
});
test('blocked starts can be recovered to a nearby free point', () => {
  const start = DESKS[0].position;
  const safe = nearestWalkable(start);
  assert.ok(safe && isWalkable(safe));
  assert.ok(findPath(start, DESKS[4].entry));
});
test('no movement is required when already at the destination', () => {
  assert.deepEqual(findPath(SLOTS[0].entry, SLOTS[0].entry), []);
});
test('slab checks catch very small corner intersections', () => {
  const obstacles = [{ x: 0, z: 0, halfX: 0.2, halfZ: 0.2 }];
  assert.equal(clearLine([-1, 0.428], [1, 0.428], obstacles), false);
  assert.equal(clearLine([-1, 0.5], [1, 0.5], obstacles), true);
});
test('continuous targets near grid boundaries remain reachable', () => {
  for (const o of OBSTACLES.slice(0, 12)) {
    const goal = [o.x, o.z + o.halfZ + 0.235];
    assert.ok(isWalkable(goal));
    const path = findPath([-2.5, 4.8], goal);
    assert.ok(path, `edge of ${o.id}`);
    assert.ok(distance(path.at(-1), goal) < 0.01);
  }
});
