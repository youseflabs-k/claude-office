/** All interaction positions and navigation obstacles share this coordinate system.
 * X = left/right, Y = up (in Three.js), Z = front/back.
 * The simulation uses [x, z] points and operates independently of the renderer.
 *
 * A studio can take one of several arrangements (see layouts.js). These tables
 * are whichever one is active. They are filled in place rather than reassigned,
 * because the rest of the app imports the bindings by value.
 */
import { LAYOUTS, expand } from './layouts.js';

export const BOUNDS = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
export const DESKS = [];
export const LOUNGE = [];
export const COFFEE = [];
export const GARDEN = [];
export const SLOTS = [];
export const OBSTACLES = [];
export const CAMERAS = {};

let active = null;

export const activeLayout = () => active;

export function setLayout(id) {
  const layout = LAYOUTS[id] ?? Object.values(LAYOUTS)[0];
  const { desks, lounge, coffee, obstacles } = expand(layout);

  active = layout;
  Object.assign(BOUNDS, layout.bounds, { maxZ: layout.floor[1] / 2 + 14 });

  const fill = (target, items) => { target.length = 0; target.push(...items); };
  fill(DESKS, desks);
  fill(LOUNGE, lounge);
  fill(COFFEE, coffee);
  const gz = layout.floor[1] / 2 + 6;
  fill(GARDEN, [
    { id:'garden-0', seat:[-8.5,gz-1.4], entry:[-8.5,gz-.75], facing:0, area:'garden' },
    { id:'garden-1', seat:[-8.5,gz+1.4], entry:[-8.5,gz+.75], facing:Math.PI, area:'garden' },
    { id:'garden-2', seat:[6.8,gz-2.2], entry:[6.8,gz-1.2], facing:0, area:'garden' },
  ]);
  fill(SLOTS, [...desks, ...lounge, ...coffee, ...GARDEN]);
  fill(OBSTACLES, [...obstacles,
    {id:'garden-table',x:-8.5,z:gz,halfX:.85,halfZ:.36},
    {id:'birdbath',x:7.2,z:gz+1,halfX:1.6,halfZ:1.6},
    {id:'garden-quiet-bench',x:3.2,z:gz+1.6,halfX:.23,halfZ:1.25},
    {id:'garden-border-west',x:-13.4,z:layout.floor[1]/2+8.5,halfX:1.7,halfZ:4},
    {id:'garden-border-east',x:13.4,z:layout.floor[1]/2+8.1,halfX:1.6,halfZ:4.9},
    {id:'garden-border-back',x:0,z:layout.floor[1]/2+13.6,halfX:5.8,halfZ:.9},
    {id:'garden-border-nook',x:-5.6,z:layout.floor[1]/2+11.4,halfX:2,halfZ:1.1},
    ...[-11.3,-5.7].flatMap(x=>[gz-1.9,gz+1.9].map(z=>({id:`pergola-${x}-${z}`,x,z,halfX:.10,halfZ:.10}))),
    ...GARDEN.map(s=>({id:s.id,x:s.seat[0],z:s.seat[1]-.30*Math.cos(s.facing),halfX:1.25,halfZ:.23})),
  ]);

  for (const key of Object.keys(CAMERAS)) delete CAMERAS[key];
  Object.assign(CAMERAS, layout.cameras);

  return layout;
}

setLayout('world');

export const getSlot = id => SLOTS.find(slot => slot.id === id);

// Which part of the floor a point belongs to. The thresholds travel with the
// arrangement, because an open floor puts the areas much further apart.
export const areaAt = ([x, z]) =>
  (z > active.floor[1] / 2 ? 'garden' : x > active.officeFrom ? 'office' : z < active.loungeFrom ? 'coffee' : 'lounge');
