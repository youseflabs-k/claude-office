/** The arrangements a studio can take.
 *
 * A layout owns everything positional: how big the floor is, whether it has
 * walls, where the desks sit, and where the lounge and coffee clusters are
 * anchored. Every layout has twelve desks, three lounge seats and three coffee
 * places, because the rest of the engine counts on those being the capacity.
 *
 * The lounge and the bar are described by an anchor plus offsets rather than
 * absolute coordinates, so moving a whole cluster is one pair of numbers and
 * its furniture, seats and obstacles travel together.
 */

// Offsets within a lounge cluster, measured from the rug.
const LOUNGE_PARTS = {
  seats: [
    { d: [-0.10, -1.83], entry: [-0.10, -0.43], facing: 0 },
    { d: [0.80, -1.83], entry: [0.80, -0.78], facing: 0 },
    { d: [-1.40, 1.22], entry: [-0.15, 1.22], facing: Math.PI / 2 },
  ],
  props: [
    ['rest-area/rug', [0, 0.004, 0], 0, [1.68, 1, 2.10], 'floor'],
    ['rest-area/sofa-l', [0.30, 0, -1.86], 0, 1],
    ['rest-area/armchair', [-1.45, 0, 1.22], Math.PI / 2, 1],
    ['rest-area/coffee-table', [1.25, 0, 0.37], 0, 1.15],
    ['shared/desk-plant', [1.15, 0.62, 0.33], 0, 0.9],
    ['shared/notebook', [1.47, 0.62, 0.52], 0.4, 0.7],
    ['rest-area/beanbag', [2.30, 0, 1.59], -0.65, 0.85],
    ['rest-area/sleeping-cat', [0.65, 0, 1.47], 0.3, 0.8],
    ['rest-area/floor-lamp', [-2.15, 0, 1.97], 0, 1.1],
  ],
  obstacles: [
    { d: [0.30, -1.98], halfX: 1.42, halfZ: 0.65, id: 'sofa' },
    { d: [-0.50, -1.23], halfX: 0.48, halfZ: 0.50, id: 'chaise' },
    { d: [-1.50, 1.22], halfX: 0.53, halfZ: 0.55, id: 'armchair' },
    { d: [1.25, 0.37], halfX: 0.60, halfZ: 0.60, id: 'coffee-table' },
    { d: [2.30, 1.59], halfX: 0.65, halfZ: 0.57, id: 'beanbag' },
    { d: [0.65, 1.47], halfX: 0.29, halfZ: 0.23, id: 'sleeping-cat' },
    { d: [-2.15, 1.97], halfX: 0.28, halfZ: 0.28, id: 'lamp' },
  ],
};

// Offsets within a coffee cluster, measured from the middle of the counter.
const COFFEE_PARTS = {
  seats: [
    { d: [-1.10, 1.70], facing: Math.PI },
    { d: [0.20, 1.70], facing: Math.PI },
    { d: [1.50, 1.70], facing: Math.PI },
  ],
  props: [
    ['coffee-corner/counter', [-1.15, 0, 0], 0, 1],
    ['coffee-corner/counter', [1.15, 0, 0], 0, 1],
    ['coffee-corner/espresso-machine', [-1.30, 1.07, 0], 0, 1.25],
    ['coffee-corner/cup-stack', [-0.15, 1.07, 0], 0, 1],
    ['coffee-corner/coffee-jar', [0.45, 1.07, 0], 0, 1],
    ['coffee-corner/mug', [0.98, 1.07, 0.25], 0, 1],
    ['shared/desk-plant', [1.90, 1.07, 0], 0, 1.4],
    ['coffee-corner/stool', [2.10, 0, 1.31], -0.3, 0.9],
    ['coffee-corner/pendant-lamp', [-1.05, 2.6, 0.35], 0, 1.1],
    ['coffee-corner/pendant-lamp', [1.10, 2.6, 0.35], 0, 1.1],
  ],
  obstacles: [
    { d: [0, 0], halfX: 2.50, halfZ: 0.60, id: 'counter' },
    { d: [2.10, 1.31], halfX: 0.30, halfZ: 0.30, id: 'stool' },
  ],
};

const grid = (cols, x0, dx, z0, dz) => ({ cols, x0, dx, z0, dz });

export const LAYOUTS = {
  world: {
    id: 'world',
    name: 'Open world',
    blurb: 'One continuous place: the office, the garden, and next door.',
    walls: false,
    ground: true,
    floor: [32, 22],
    bounds: { minX: -15.6, maxX: 15.6, minZ: -10.6, maxZ: 10.6 },
    desks: grid(4, 0.5, 4.0, -6.0, 6.0),
    lounge: [-9.3, 5.0],
    coffee: [-9.3, -6.0],
    officeFrom: -3.5,
    loungeFrom: -0.5,
    cameras: {
      // Straight on from the front and raised, rather than down a corner at
      // it: you face the room instead of surveying it. Shallower than this and
      // the floor flattens into a strip.
      studio: { position: [13, 24, 34], target: [0, 1.0, 0.5], size: 23 },
      office: { position: [5, 15, 22], target: [6.5, 1.0, 0], size: 21 },
      lounge: { position: [-6, 12, 18], target: [-9.3, 0.9, 5], size: 12 },
      coffee: { position: [-6, 12, 12], target: [-9.3, 1.1, -5], size: 11 },
      top: { position: [0, 38, 0.01], target: [0, 0, 0], size: 28 },
    },
    extras: [
      ['shared/floor-plant', [-14.1, 0, 0.4], 0.3, 1.6, { halfX: 0.30, halfZ: 0.32, id: 'plant-west' }],
      ['shared/floor-plant', [14.6, 0, -9.2], 0, 1.6, { halfX: 0.30, halfZ: 0.32, id: 'plant-east' }],
      ['shared/floor-plant', [-2.0, 0, 9.3], 0.8, 1.5, { halfX: 0.30, halfZ: 0.32, id: 'plant-south' }],
      ['rest-area/bookcase', [-14.2, 0, 3.0], Math.PI / 2, 1.3, { halfX: 0.28, halfZ: 0.82, id: 'bookcase' }],
      ['office-floor/water-cooler', [-3.0, 0, -9.3], 0, 1.1, { halfX: 0.30, halfZ: 0.30, id: 'water-cooler' }],
      ['office-floor/server', [15.0, 0, 1.4], -0.4, 1.1, { halfX: 0.42, halfZ: 0.42, id: 'server' }],
      ['office-floor/task-board', [-2.8, 1.4, -10.4], 0, 1.1],
    ],
    labels: [
      ['THE WORKSHOP', [6.5, 0.00, 9.8], 5.0],
      ['REST & RESET', [-9.3, 0.06, 9.5], 3.4],
      ['COFFEE & IDEAS', [-9.3, 0.00, -2.3], 3.4],
    ],
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

// Anchor-plus-offset arithmetic drifts in the last bits — -5.95 + 2.70 is not
// quite -3.25 — and the studio packs furniture tightly enough that a route can
// graze an obstacle's exact corner. Rounding keeps an expanded layout equal to
// the coordinates it was written from.
const r = (n) => Math.round(n * 1e4) / 1e4;
const r2 = ([a, b]) => [r(a), r(b)];

/** Expand a layout into the flat tables the engine and renderer use. */
export function expand(layout) {
  const { cols, x0, dx, z0, dz } = layout.desks;

  const desks = Array.from({ length: 12 }, (_, i) => {
    const x = r(x0 + (i % cols) * dx);
    const z = r(z0 + Math.floor(i / cols) * dz);
    return {
      id: `desk-${i}`, index: i, position: [x, z],
      // The seat is on the far side so the character faces the camera.
      seat: [x, r(z - 0.94)], entry: [x, r(z - 1.52)], facing: 0,
      area: 'office', label: `Desk ${String(i + 1).padStart(2, '0')}`,
    };
  });

  const [lx, lz] = layout.lounge;
  const lounge = LOUNGE_PARTS.seats.map((s, i) => ({
    id: `lounge-${i}`,
    seat: r2([lx + s.d[0], lz + s.d[1]]),
    entry: r2([lx + s.entry[0], lz + s.entry[1]]),
    facing: s.facing, area: 'lounge',
  }));

  const [cx, cz] = layout.coffee;
  const coffee = COFFEE_PARTS.seats.map((s, i) => ({
    id: `coffee-${i}`,
    seat: r2([cx + s.d[0], cz + s.d[1]]),
    entry: r2([cx + s.d[0], cz + s.d[1]]),
    facing: s.facing, area: 'coffee',
  }));

  const obstacles = [
    ...desks.map(d => ({ x: d.position[0], z: d.position[1], halfX: 1.30, halfZ: 0.575, id: d.id })),
    ...LOUNGE_PARTS.obstacles.map(o => ({ ...o, x: r(lx + o.d[0]), z: r(lz + o.d[1]) })),
    ...COFFEE_PARTS.obstacles.map(o => ({ ...o, x: r(cx + o.d[0]), z: r(cz + o.d[1]) })),
    ...layout.extras.filter(e => e[4] && typeof e[4] === 'object')
      .map(([, p, , , o]) => ({ ...o, x: p[0], z: p[2] })),
  ];

  return { desks, lounge, coffee, obstacles, loungeParts: LOUNGE_PARTS, coffeeParts: COFFEE_PARTS };
}
