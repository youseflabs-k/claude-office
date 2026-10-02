import { store } from '../store/store.js';
const STATUSES = { working: 'work', idle: 'idle', coffee: 'coffee', resting: 'rest', completed: 'celebrate' };
/** Backend events must refer to an existing agent ID in the current studio.
 * Provider API keys stay on YOUR server; this module only consumes status events.
 */
export function applyAgentEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.agentId !== 'string') throw new Error('An agentId is required.');
  if (!store.getSnapshot().world.agents.some(a => a.id === event.agentId)) throw new Error(`Unknown agent: ${event.agentId}`);
  if (event.status != null && !Object.hasOwn(STATUSES, event.status)) throw new Error('Unknown agent status.');
  if (event.status) store.command(STATUSES[event.status], null, event.agentId, { emit: false });
  store.applyTelemetry(event);
  if (typeof event.message === 'string') store.say(event.message, event.agentId);
}
export function connectAgentStream(url, { withCredentials = false, onError = console.error } = {}) {
  const parsed = new URL(url, window.location.href);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an HTTP(S) event stream.');
  const source = new EventSource(parsed.href, { withCredentials });
  source.onmessage = e => { try { applyAgentEvent(JSON.parse(e.data)); } catch (error) { onError(error); } };
  source.onerror = onError;
  return () => source.close();
}
export function installAgentBridge() {
  const handler = e => { try { applyAgentEvent(e.detail); } catch (error) { store.notify(error.message, 'error'); } };
  window.addEventListener('cozy-office:agent', handler);
  window.cozyOffice = {
    getAgents: () => store.getSnapshot().world.agents.map(a => ({ id: a.id, name: a.name, archetype: a.archetype, phase: a.phase })),
    applyAgentEvent, connectAgentStream,
    command: (agentId, command, point) => store.command(command, point, agentId),
    useLocalSimulation: agentId => store.useLocalSimulation(agentId),
    exportWorkspace: () => JSON.parse(store.exportJSON())
  };
  return () => { window.removeEventListener('cozy-office:agent', handler); delete window.cozyOffice; };
}
