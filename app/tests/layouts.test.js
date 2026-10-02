import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_IDS, LAYOUTS } from '../src/simulation/layouts.js';
import { setLayout, SLOTS, DESKS, LOUNGE, COFFEE, GARDEN, OBSTACLES, BOUNDS, areaAt } from '../src/simulation/layout.js';
import { isWalkable, findPath, clearLine, distance, lerpPoint } from '../src/simulation/navigation.js';

// Every arrangement has to be as usable as the one the pack shipped with: the
// capacity the engine counts on, somewhere to stand at every seat, and a route
// between any two of them that does not cut through the furniture.

test('every layout offers the capacity the engine expects', () => {
  for (const id of LAYOUT_IDS) {
    setLayout(id);
    assert.equal(DESKS.length, 12, `${id} desks`);
    assert.equal(LOUNGE.length, 3, `${id} lounge`);
    assert.equal(COFFEE.length, 3, `${id} coffee`);
    assert.equal(SLOTS.length, 21, `${id} slots`);
  }
  setLayout('world');
});

test('every layout keeps its furniture and seats inside the floor', () => {
  for (const id of LAYOUT_IDS) {
    setLayout(id);
    const [w, d] = LAYOUTS[id].floor;
    for (const slot of SLOTS) {
      for (const point of [slot.seat, slot.entry]) {
        assert.ok(Math.abs(point[0]) <= w / 2, `${id} ${slot.id} x off the floor`);
        assert.ok((slot.area === 'garden' ? point[1] >= d / 2 && point[1] <= BOUNDS.maxZ : Math.abs(point[1]) <= d / 2), `${id} ${slot.id} z off the floor`);
      }
    }
    for (const o of OBSTACLES) {
      assert.ok(o.x >= BOUNDS.minX && o.x <= BOUNDS.maxX, `${id} ${o.id} x out of bounds`);
      assert.ok(o.z >= BOUNDS.minZ && o.z <= BOUNDS.maxZ, `${id} ${o.id} z out of bounds`);
    }
  }
  setLayout('world');
});

test('every layout has a standing place at each seat', () => {
  for (const id of LAYOUT_IDS) {
    setLayout(id);
    for (const slot of SLOTS) {
      assert.ok(isWalkable(slot.entry), `${id} ${slot.id} entry is blocked`);
    }
  }
  setLayout('world');
});

test('every layout routes between all of its slots without crossing furniture', () => {
  for (const id of LAYOUT_IDS) {
    setLayout(id);
    for (const from of SLOTS) for (const to of SLOTS) {
      const path = findPath(from.entry, to.entry);
      assert.notEqual(path, null, `${id}: ${from.id} → ${to.id} has no route`);
      let previous = from.entry;
      for (const point of path) {
        assert.ok(clearLine(previous, point), `${id}: ${from.id} → ${to.id} crosses furniture`);
        const steps = Math.max(1, Math.ceil(distance(previous, point) / 0.04));
        for (let i = 0; i <= steps; i++) {
          assert.ok(isWalkable(lerpPoint(previous, point, i / steps)),
            `${id}: ${from.id} → ${to.id} clips furniture`);
        }
        previous = point;
      }
    }
  }
  setLayout('world');
});

// The area thresholds travel with the arrangement, so each zone's own seats
// have to report that zone — the roster counts and the camera presets read it.
test('every layout reports the right area for its own seats', () => {
  for (const id of LAYOUT_IDS) {
    setLayout(id);
    for (const slot of [...DESKS, ...LOUNGE, ...COFFEE, ...GARDEN]) {
      assert.equal(areaAt(slot.seat), slot.area, `${id} ${slot.id} sits in the wrong area`);
    }
  }
  setLayout('world');
});

test('switching layouts and back restores the original tables', () => {
  setLayout('world');
  const before = JSON.stringify({ SLOTS, OBSTACLES, BOUNDS });
  setLayout('open');
  setLayout('rows');
  setLayout('world');
  assert.equal(JSON.stringify({ SLOTS, OBSTACLES, BOUNDS }), before);
});
