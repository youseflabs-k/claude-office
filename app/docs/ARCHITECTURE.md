# Architecture and customization

## React owns the product interface; Three.js owns the render loop

`App.jsx` renders ordinary React components. The WebGL view is a memoized component which creates one `OfficeScene` instance on mount and disposes it on unmount. The renderer and character mixers update outside React. UI state is exposed through a small external store; `useStudio` connects it to React using `useSyncExternalStore`.

The simulation ticks at 10 Hz while visible. Rendering uses `requestAnimationFrame` and interpolates positions and headings. The timescale is shared between the engine and animation mixers. Pausing stops movement, local task progress and animation playback, but still permits camera controls, selection, and editing. Commands can be prepared while paused and continue on resume.

The engine and navigator do not import React, Three.js, or browser APIs. They can be exercised by Node tests. Snapshot replacement is immutable; components are not asked to observe mutable Three.js objects.

## Coordinates

The world is an 18 × 12 floor. The renderer uses `[x, y, z]` with positive Y up. Navigation and application state use `[x, z]` pairs. Character forward is positive Z at rotation zero; desk-facing characters rotate by pi to face negative Z.

The existing GLB root already converts the original model coordinates to Y-up. Do not apply an additional global 90-degree rotation to the loaded models.

The critical shared layout is in `src/simulation/layout.js`:

- `DESKS`: twelve desks, each with its visual center, chair seat, clear entry point, facing angle and stable ID.
- `LOUNGE`: three seated positions with individual approach points.
- `COFFEE`: three standing positions in front of the counter.
- `OBSTACLES`: floor footprints inflated by a navigation clearance.
- `CAMERAS`: studio, top, office, lounge and coffee framing presets.

The separate **entry** and **seat** coordinates are intentional. A walking path ends at an open approach point. The sit-down transition then moves the agent into the seat while playing the sit-down animation. Standing reverses this pattern before the next route starts.

Furniture is not draggable in this version. To rearrange the studio, edit the scene and shared navigation footprints together.

## Agent state machine

| Application phase | GLB clip | Behavior |
|---|---|---|
| `idle` | `idle` | Standing, waiting for a command |
| `working` | `typing` | Seated at the assigned desk |
| `walking` | `walk` | Following a planned route |
| `coffee` | `coffee-sip` | At the reserved coffee position |
| `resting` | `rest` | Seated in the lounge |
| `celebrating` | `celebrate` | Short celebration, then standing idle |
| `sitting-down` | `sit-down` | Entry-to-seat transition |
| `standing-up` | `stand-up` | Seat-to-entry transition |

A typical action is:

```text
working → standing-up → walking → coffee
coffee → walking → sitting-down → working
working → standing-up → walking → sitting-down → resting
resting → standing-up → walking → idle
```

The sit/stand transitions last 1.2 simulation seconds. Animation actions fade across 0.22 seconds. Sit and stand clips play once and hold their final pose; the other clips loop while that phase is active. Repeated identical commands do not restart in-progress transitions, which matters when a backend repeats a status every second.

There are no skin/bone rigs in these assets. The eight clips animate named nodes with position, rotation and scale tracks. Each agent has its own cloned node tree and AnimationMixer, while immutable geometry/materials are reused. Names are unique inside each model, so different agents can use the same role model independently.

## Navigation and reservations

The navigator uses a 0.25-unit eight-neighbor grid with A* search. It does not cut diagonal corners. Continuous start/goal positions connect to visible grid points, and exact segment-versus-rectangle tests smooth the resulting path without slipping through narrow furniture corners.

Walkable bounds and static furniture footprints are enforced for move commands. Chairs and designated seats are handled by interaction entry/seat logic rather than being treated as impassable floor obstacles.

Coffee and lounge slots are reserved as soon as a command is accepted. Occupants and agents en route both count against capacity. Coffee chats reserve two distinct slots atomically; a failed reservation leaves the existing world unchanged. Assigned desks are unique within a project.

Moving agents use soft priority yielding at intersections. This is **not a physics engine or a complete crowd avoidance solver**. Closely placed agents can visually overlap temporarily, particularly around a shared spawn point or during seat transitions. Furniture avoidance is geometric and deterministic; character collision is approximate. For a dense crowd, replace the yielding behavior with your preferred crowd solver and rerun the navigation tests.

The original source footprints and rendered GLBs are approximations, not exact mesh colliders.

## Render details

The scene is genuinely assembled from objects: a beveled base, wood floor, back wall, left wall with arch openings, window frames, signs, desks, chairs, monitors, sofa, armchair, counter, coffee equipment, shelves and plants. The floor, sky gradient and signs are canvas textures generated locally. There is no external HDRI, font download or image-generation request at runtime.

The scene uses an orthographic camera, ambient environment lighting generated from the local `RoomEnvironment` helper, a warm directional light with shadows, and local coffee/lounge lights. Night mode changes lighting and UI treatment. It does not regenerate a different window illustration or replace every material.

Static prop meshes are combined by material within each prop before cloning. Shadow-map and pixel-ratio settings offer three quality levels. The frame loop reuses models, tracks selection paths and projects HTML labels above the characters. Labels and speech are ordinary DOM text, not baked into textures.

Labels intentionally prioritize readability. They are not depth-occluded by every wall or prop, so a label may remain visible over intervening geometry when the camera is rotated.

## Selection and commands

Raycasting resolves semantic `userData` up an object's parent chain:

```js
{ agentId: 'app-creator-0' } // select agent
{ deskIndex: 4 }            // choose/reassign desk
{ zone: 'coffee' }          // send selected agent to coffee
{ zone: 'rest' }            // send selected agent to lounge
{ floor: true }             // click-to-move target
```

Pointer movement over five pixels is treated as camera dragging, not a selection click. The floor requires Shift-click or the Move tool. The DOM roster and inspector provide equivalent selection and action controls.

## Persistence

A session is saved every 2.5 seconds and on ordinary unload, on a best-effort basis. Storage key: `cozy-office:workspace:v1`.

Each project has its own team, assignments, tasks, positions and metrics. Switching projects retains its current in-memory state. Inactive projects do not keep simulating in the background. Preferences are shared across projects.

Exports omit transient routes, pending commands, speech and activity history. Imports reconstruct safe states, enforce unique desks/agent IDs, validate known role names, bound numeric/text data and clear transient navigation. An agent exported during a walk or transition resumes standing at a nearby safe point instead of jumping back into a stale route. Stable working/coffee/resting states preserve valid occupied slots.

Import targets the **currently selected project**, even when the JSON was exported from a different project. Reset affects only the selected project. Export files are not encrypted.

## Extending the app

To add another character, add metadata, a portrait and a GLB with the expected clip names. To add another state, extend the engine phase map, command validation, mixer clip map, inspector controls, integration status mapping and persistence rules. Add tests for the new transition and any resource reservation.

To connect an application backend, keep the scene independent of the provider. Convert your backend's task/runtime events into the small UI event contract in `docs/INTEGRATION.md`. Do not put provider secrets or unrestricted execution logic in this React project.

React, Three.js and Vite are the only declared application/build packages. There is no UI component framework or runtime physics dependency.
