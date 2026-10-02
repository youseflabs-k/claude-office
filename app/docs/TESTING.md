# Verification record

## Checks executed for this archive

The application source was checked with Node.js 22.16.0.

| Check | Result |
|---|---|
| Dependency-free Node unit/integration suite | 33 passed, 0 failed |
| Directed navigation pairs | All 324 pairs among 18 interaction entry points passed |
| Route collision checks | Exact segment checks and dense point sampling against the configured static furniture footprints passed |
| Local GLB structure | 52 models parsed, binary lengths/buffer bounds and required scenes validated |
| Character animation inventory | 16 characters × 8 expected node-transform clips = 128 clips |
| Portrait inventory | 16 local PNG signatures validated |
| Scene model paths | Every referenced prop resolves to a local GLB |
| Model dependencies | No externally referenced GLB buffers or textures |
| JavaScript/JSX syntax | 28 modules parsed, JSX transpilation syntax checked |
| Local module imports and named exports | 67 import edges checked |
| CSS syntax | Stylesheet parsed successfully |
| Optional mock SSE server | Health 200, stream 200, allowlisted origin accepted, disallowed origin 403, malformed ID 400, client cleanup after disconnect |

Source checks used the authoring environment's TypeScript parser/transpiler and PostCSS parser as an additional verification step. Those tools are not runtime dependencies of this app. The included repeatable project checks are `npm test`, `npm run check:assets`, and—after installation—`npm run build`.

## Explicitly not verified here

**A Vite production build and an actual React/WebGL browser session were not executed.** Dependency installation was attempted but the npm registry could not be resolved (`EAI_AGAIN`). No production bundle or screenshot from a running React application is included or claimed.

Source parsing and pure simulation tests do not establish GPU compatibility, final browser rendering, animation visual quality, frame rate, mobile layout, or pixel-perfect resemblance to the earlier image references. Validate those in your intended browsers before shipping. This archive includes complete source and models, not a pre-certified production deployment.

## Run locally

```sh
npm test
npm run check:assets
npm install
npm run build
npm run dev
```

The test files cover initial state, independent projects, work/coffee/rest/stand transitions, movement, celebration, immutability, invalid commands, unique seat reservations, repeated backend commands, atomic coffee chats, hiring capacity, bounded metrics, external data ownership, autonomy, time-step bounds, activity-log bounds, all slot-to-slot routes, exact corner checks, continuous floor targets, import validation, storage failures and backend event-loop protection.

## Browser acceptance checklist

Run this checklist after `npm install` in a browser with WebGL 2 enabled.

1. Load the initial studio. Check the loading screen resolves, the full 3D room is visible and the four original agents appear. Inspect the developer console/network panel for errors and failed local model requests.
2. Select each character from the canvas and roster. Confirm the inspector name, model, task and status update, and that the green selection ring follows the selection.
3. Send a working agent to coffee. Confirm the agent stands up before walking, avoids furniture, arrives at a free spot and uses the coffee animation. Send the agent back to work and check the sit-down/typing transition.
4. Send agents to all three lounge positions and coffee spots. Confirm further reservations fail cleanly, then release a position and try again.
5. Use Move and Shift-click on open floor. Confirm paths avoid obstacles and clicking through furniture does not teleport the character. Test standing, celebrating, repeated commands and commands issued midway through a transition.
6. Arrange a two-person coffee chat. Check separate reservations and your custom speech bubble. Try a full coffee corner and ensure the chat fails without changing the participants' prior goals.
7. Hire different appearances, including the robot, up to twelve assigned desks. Check loading, independent animations, selection and removal. Reassign the selected agent to an unassigned desk.
8. Edit an agent name/model label/task. Check nameplates use the edited text. Confirm provider connections are not implied by a display-label change.
9. Pause, resume and change speed. Test autonomous routines for several minutes and inspect for stuck agents or unacceptable visual overlap.
10. Test orbit, pan, scroll/pinch zoom, room presets, top view, focus, fullscreen, labels, night lighting and all three graphics settings.
11. Switch projects, reload, export, reset one project and import. Check imported moving agents normalize to safe standing positions and that other project data is not reset.
12. Run the optional SSE mock server and connect it. Check externally supplied values replace simulated values, repeated statuses do not reset travel, and incoming events do not create outgoing command loops. Disconnect and switch that agent back to local simulation.
13. Test a narrow phone-sized viewport, a short laptop viewport and a wide desktop viewport. Check the navigation drawer, inspector scrolling, keyboard focus, native dialogs, canvas gestures and readable control labels.
14. Disable GPU acceleration or block a model request to inspect error handling. Confirm no credentials or external image/font requests occur by default.

The app has approximate crowd yielding rather than rigid character collision. Treat crowded-scene overlaps and visual seat alignment as part of your browser art/interaction acceptance pass.
