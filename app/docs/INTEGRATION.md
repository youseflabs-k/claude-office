# Connect your actual agents

The default workspace is a local simulation. This adapter supplies a connection boundary; it does not execute prompts or jobs, create a provider account, or authenticate users.

Keep the actual agent runtime and provider secrets on your server. The browser only needs an agent ID, state and non-sensitive display metrics.

## Incoming event contract

```js
{
  agentId: 'app-creator-0',       // required: an existing agent in this project
  status: 'working',             // optional: working | idle | coffee | resting | completed
  task: 'Review the login flow', // optional, up to 180 characters
  model: 'Your model label',     // optional, up to 48 characters
  tokens: 8120,                  // optional, nonnegative numeric value
  progress: 67,                  // optional, clamped to 0–100
  energy: 83,                    // optional UI metric, clamped to 0–100
  tasksCompleted: 3,             // optional, nonnegative count
  message: 'Checking edge cases' // optional, your text for a speech bubble
}
```

An unknown ID or status is rejected. IDs are not looked up by editable display name. Call `window.cozyOffice.getAgents()` to inspect the current IDs. No user text is evaluated as JavaScript or injected as raw HTML.

A received event marks the agent externally controlled. This stops automatic token/progress/energy changes and autonomous commands for that agent. Received numeric values are bounded; invalid numeric types are ignored. External control persists across browser reloads. The header shows BACKEND EVENTS when the current studio contains any externally controlled agents; this is a data-source indicator, **not a guarantee that a stream is presently connected**.

Physical movement still takes time. A `working` event starts a trip to the assigned desk; it does not teleport the character. A full lounge or coffee corner can reject a movement request without discarding the backend's metrics. Repeated status messages do not restart an in-progress trip or sit-down transition.

## Option A: feed a JavaScript event

From your existing application integration layer:

```js
window.dispatchEvent(new CustomEvent('cozy-office:agent', {
  detail: {
    agentId: 'app-creator-0',
    status: 'working',
    task: 'Review the authentication change',
    tokens: 3480,
    progress: 42,
    model: 'My server-side agent'
  }
}));
```

From application source, the equivalent direct call is:

```js
import { applyAgentEvent } from './integrations/agentBridge.js';
applyAgentEvent({ agentId: 'app-creator-0', status: 'coffee' });
```

Adjust the relative import path for your module. Unknown or malformed events throw from the direct API; handle them in your integration layer. The window-event handler displays a notification for such errors.

## Option B: use a Server-Sent Events stream

The server must send `Content-Type: text/event-stream` and frames like:

```text
data: {"agentId":"app-creator-0","status":"working","progress":30,"tokens":2800}

```

Each frame ends in a blank line. Connect from your browser integration code:

```js
const disconnect = window.cozyOffice.connectAgentStream('/api/agent-events', {
  withCredentials: false,
  onError: error => console.warn('Agent stream:', error)
});

// Call on logout, project switch, or component unmount:
disconnect();
```

`EventSource` handles basic reconnection. This adapter does not deduplicate event IDs or implement replay, ordering guarantees or a heartbeat UI. Add those to your backend/integration layer for a long-running deployment.

Use same-origin endpoints when possible. Cross-origin endpoints need an appropriate CORS policy. Browser EventSource does not accept arbitrary authorization headers through this adapter; use a properly authenticated same-origin endpoint or an integration transport suited to your authentication design. Do not embed provider keys in URLs or frontend environment variables.

Streams do not automatically follow project switches. Disconnect/reconnect the appropriate stream when the project changes, or route events in your own app. Incoming IDs must belong to the currently displayed studio. Events for unknown or removed agents are rejected.

## Run the included mock server

This is an explicit **mock status stream** to test the wiring, not an AI service.

Start the app as usual. In another terminal:

```sh
npm run demo:server
```

With the App Creator project open, run this in the browser console:

```js
const disconnect = window.cozyOffice.connectAgentStream(
  'http://127.0.0.1:8787/events?agentId=app-creator-0'
);
```

The selected ID receives mock working/completed/coffee events and a model label of `Mock SSE server`. The server binds only to `127.0.0.1`, limits simultaneous streams and permits the usual Vite localhost origins. Set `DEMO_PORT` or `DEMO_ORIGIN` for a different local port/origin. `/health` reports the active mock stream count.

To stop:

```js
disconnect();
window.cozyOffice.useLocalSimulation('app-creator-0');
```

Or disconnect and use **Use local simulation** in Agent Details. Merely renaming the model label does not change data ownership. An active stream will mark the agent externally controlled again on its next event.

## Outgoing UI commands

The UI emits `cozy-office:command` after an accepted user command:

```js
window.addEventListener('cozy-office:command', event => {
  const { agentId, command, point, deskIndex, projectId } = event.detail;
  // Route only explicitly supported intents to YOUR backend.
  console.log({ agentId, command, point, deskIndex, projectId });
});
```

Commands are `work`, `coffee`, `rest`, `idle`, `celebrate`, and `move`. `point` is an `[x, z]` world coordinate for movement, otherwise it is normally null or undefined. Coffee chats emit a coffee command for each participant. Hiring and desk reassignment emit a work command. Name/task edits and removals are local data edits; they are not automatically sent to your server.

The renderer responds optimistically. This example does not wait for a backend acknowledgment, persist an outbound queue, or roll back rejected server commands. For server-authoritative actions, add authorization, validation, correlation IDs and acknowledgments at this boundary.

**Incoming backend updates do not emit outgoing commands**, which avoids an event feedback loop. Avoid bridging unrelated DOM events or blindly executing text from task fields.

## Browser helper API

Available after the React app mounts:

```js
window.cozyOffice.getAgents();
window.cozyOffice.applyAgentEvent(event);
window.cozyOffice.command(agentId, 'work');
window.cozyOffice.command(agentId, 'move', [-2.5, 4.8]);
window.cozyOffice.connectAgentStream(url, options); // returns disconnect function
window.cozyOffice.useLocalSimulation(agentId);
window.cozyOffice.exportWorkspace();               // returns a plain JSON-safe object
```

The bridge unregisters its window event handler on app unmount. A custom stream connection remains the responsibility of the caller; always keep and invoke its disconnect function.

## Deployment boundary

This archive includes the complete local UI and scene runtime, not a production AI backend. Add your own authentication, tenancy, authorization, durable job storage, service-side provider credentials, event ordering/replay and observability as needed. The supplied mock server has no authentication and must not be exposed as a production agent endpoint.
