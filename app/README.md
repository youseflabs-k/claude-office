# Cozy Office · React 3D Agent Studio

An interactive React application built around your cozy office character pack. The office is an actual Three.js scene with 3D furniture and animated GLB characters—not a screenshot, a sprite-board mockup, or a video.

The initial App Creator studio has the four original agents: coral code reviewer, blue mobile engineer, green backend engineer, and yellow QA engineer. There are sixteen available character appearances and twelve assignable desks per project.

## Start here

Use **Node.js 22.12 or newer**. Extract the complete archive, then run these commands inside its `cozy-office-react` folder:

```sh
npm install
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173`.

**Do not double-click `index.html`.** JSX and package imports need Vite during development, and GLB models must be served over HTTP. An internet connection is needed for the first dependency installation. All models, portraits, icons, and scene textures are local; the app does not request external assets or call an AI service by default.

A WebGL 2-capable browser with hardware acceleration is required for the 3D canvas. Graphics quality can be lowered in Studio settings.

### Production build

```sh
npm run build
npm run preview
```

Deploy the **entire `dist/` directory**, including `models/` and `portraits/`, to your static web host. A small dependency-free production server is also included:

```sh
npm run build
npm start
```

`npm start` serves `dist/` on `127.0.0.1:4173`. Override `PORT` and `HOST` when needed. The dev command intentionally uses `--host 0.0.0.0` so the interface can be opened from another device on your network; remove this flag in `package.json` to make development loopback-only.

## What is implemented

| Area | Interaction |
|---|---|
| Office floor | Twelve desks, selectable agents, assigned workstations, task editing, typing, live status labels, and simulated task progress. Click an unassigned desk to reassign the selected agent. |
| Rest area | Three reservable seats across the sofa and armchair. Agents walk to the lounge, sit down, rest, and stand before leaving. |
| Coffee corner | Three reservable standing spots. Agents walk to the counter, hold/sip coffee, and return to work. Two agents can be sent to a coffee chat together. |
| Characters | Hire any of sixteen appearances, rename agents, change display model labels, select/focus, move, work, rest, drink coffee, stand idle, celebrate, or display your custom speech bubble. |
| Camera | Orbit, pan, zoom, top view, full studio view, room views, focus on selected agent, fullscreen, and sunset/night lighting. |
| Simulation | Pause/resume, 0.5×/1×/2× speed, optional autonomous routines, pathfinding around furniture, resource reservations, and an activity log. |
| Workspace | Four independent project presets, browser-local persistence, validated JSON import/export, per-project reset, search and room filters. |
| Integration | A browser event API and an optional Server-Sent Events adapter for your backend. An explicitly mocked local SSE server is included as a connection example. |

There are **52 local GLB files: 16 character models and 36 furniture/prop models**. Each character includes the same eight named animation clips, for **128 model-embedded clips**. The scene uses the needed subset of furniture; all 36 models are available for customization. Sixteen portrait PNGs are included for the interface.

## Controls

Click a character, their floating nameplate, or their roster card to select them. Use the right-hand inspector to give them a direction. Clicking the sofa or coffee counter also sends the selected agent to that area.

| Input | Action |
|---|---|
| Left-drag / one-finger drag | Orbit the camera |
| Mouse wheel / pinch | Zoom |
| Right-drag | Pan |
| Shift-click the floor | Move the selected agent to an open spot |
| `M`, then click the floor | Enable click-to-move mode |
| `1` / `2` / `3` | Work / coffee / rest |
| `4` / `5` | Stand idle / celebrate |
| `F` | Focus the selected agent |
| `Space` | Pause or resume |
| `?` | Open the help dialog |
| `Escape` | Close a dialog or leave move mode |

Keyboard shortcuts are ignored while typing into fields. The interface also provides buttons for these actions. On narrower screens, project navigation becomes a drawer and the inspector moves below the stage.

## Local simulation versus real agents

By default this is a **local visual simulation**. Model labels are editable text, not provider connections. Tokens, progress, energy, task completion and autonomous behavior are generated locally for the demonstration. Speech bubbles contain your text; coffee chats do not call an LLM or generate a conversation.

To connect an actual agent runtime, keep provider credentials and agent execution on your server. Send status events to the browser using `src/integrations/agentBridge.js`. See **[docs/INTEGRATION.md](docs/INTEGRATION.md)** for the full contract and runnable SSE example.

After an agent receives a backend event, it is marked externally controlled. The simulation stops fabricating its metrics or choosing autonomous actions. That mode is saved with the workspace. Disconnect the stream and click **Use local simulation** in the inspector to return to demo mode.

The project does not include an AI orchestrator, provider billing integration, authentication, a database, cloud synchronization, multiplayer, audio, or a room editor. It is a complete local front-end application with a backend integration boundary, not a hosted agent service.

## Project layout

```text
cozy-office-react/
  index.html
  package.json
  vite.config.js
  src/
    main.jsx                  React entry and error boundary
    App.jsx                   Workspace shell
    styles.css                Dark theme, responsive layout and UI states
    components/               Navigation, toolbar, roster, inspector and dialogs
    scene/
      OfficeScene.js          WebGL renderer, picking, animation and camera
      environment.js          Authored 3D studio layout and local textures
      ModelLibrary.js         GLB loading, caching and static prop batching
    simulation/
      catalog.js              Sixteen character definitions
      layout.js               Desks, seats, navigation obstacles and cameras
      navigation.js           Pure A* and segment checks
      engine.js               Pure agent state machine and commands
    store/
      store.js                Shared state, commands and simulation lifecycle
      persistence.js          Bounded JSON import and local storage
      hooks.js                React subscription bridge
    integrations/
      agentBridge.js          Incoming agent events and outgoing UI commands
  public/
    models/characters/        16 animated GLB models
    models/furniture/         36 prop GLB models, grouped by zone
    portraits/                16 local PNG portraits
    favicon.svg
  examples/agent-server.mjs    Optional mocked SSE event server
  tests/                      Dependency-free Node tests
  scripts/                    Asset checker and static production server
  docs/                       Architecture, integration, testing and provenance
```

## Customize it

**Agent names and model labels:** use the pencil in the Agent Details panel. Labels are HTML and remain editable at runtime.

**Characters:** edit `src/simulation/catalog.js`, add a GLB under `public/models/characters/`, and add a matching PNG portrait. The GLB must expose the eight animation clip names listed in the architecture guide. Changing a role's appearance requires a matching model; changing a UI color does not recolor an existing GLB.

**Room layout:** change prop placement in `src/scene/environment.js` and update interaction positions and obstacles in `src/simulation/layout.js` together. Run `npm test` after moving furniture. Units use Y-up in Three.js; simulation positions are `[x, z]`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Theme:** edit the CSS variables at the start of `src/styles.css`. Scene material/lighting colors live in the scene files.

**Tasks and behavior:** the engine is independent of React and Three.js. Local task rates, rest durations and movement speed are in `src/simulation/engine.js`.

## Checks and verification

```sh
npm test
npm run check:assets
npm run build
```

The first two commands use only Node built-ins and can run before `npm install`.

**Executed during this handoff:** 33 automated tests passed; every one of the 324 directed interaction-point routes was checked; all 52 GLBs, 128 embedded animation clips and 16 portraits were validated; JavaScript/JSX syntax, local module references and CSS parsing passed; the mocked SSE server was smoke-tested locally.

**Not executed during this handoff:** a Vite production bundle or a real React/WebGL browser session. The environment could not resolve the npm registry (`EAI_AGAIN`), so dependency installation was unavailable. The source is supplied without `node_modules`, a fabricated lockfile, or an unverified `dist` build. Run `npm install` followed by the commands above on your machine. Commit the resulting `package-lock.json` for your deployment.

See [docs/TESTING.md](docs/TESTING.md) for the verification record and browser acceptance checklist.

## Common issues

**The HTML opens as a blank page:** launch with `npm run dev`. Opening source HTML with `file://` is not supported.

**Models return 404:** keep the complete `public/models` folder during development and the complete model folder produced in `dist` during deployment. Paths are case-sensitive on many hosts.

**The graphics context cannot start:** enable hardware acceleration and use a browser that can create a WebGL 2 context. A screenshot fallback is not bundled; the app displays an error rather than pretending it rendered a live environment.

**The scene runs slowly:** select Lightweight graphics, close other GPU-heavy tabs, and reduce the number of hired agents. The crowd behavior uses simple yielding, not a full physics/crowd solver.

**An agent will not take a break:** all seats or coffee spots may be reserved. A reservation is made before walking begins, not only after arrival. Release a spot by sending an occupant back to work.

**An agent remains frozen after disconnecting a backend:** this is intentional; external metrics must not silently become invented metrics. Use the local simulation control or reset the project.

**A workspace is not retained:** browser storage may be disabled, cleared, or full. Export JSON before moving between devices or clearing site data. Stored workspace data is not encrypted; do not put secrets in names, model labels or task descriptions.

## Implementation references

Official documentation consulted for the integration and requirements:

- Vite setup: https://vite.dev/guide/
- React external-store subscription: https://react.dev/reference/react/useSyncExternalStore
- Three.js renderer: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js animation mixer: https://threejs.org/docs/pages/AnimationMixer.html

The bundled asset provenance is documented separately in [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md).
