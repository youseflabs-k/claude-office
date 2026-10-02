// The Claude integration.
//
// The studio's workspaces are the Claude projects you have imported, and the
// people in them are the sessions and subagents actually running right now —
// not a local simulation. Everything here talks to the panel server, which is
// what watches ~/.claude and knows when an agent starts, uses a tool or stops.
//
// The simulation stays in charge of bodies: this module only says who exists
// and what they are doing. Walking, sitting and seat reservations are the
// engine's business, so a status arriving every second never teleports anyone.

const json = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
};

export const getProjects = () => json('/api/projects');
export const getRoom = (projectId) =>
  json(`/api/state?project=${encodeURIComponent(projectId)}`);
export const getTranscript = (sessionId, agentId, options = {}) =>
  json(`/api/transcript?session=${encodeURIComponent(sessionId)}`
    + `&agent=${encodeURIComponent(agentId ?? '')}&limit=120`, options);

export const importProject = (dir) =>
  json(`/api/import?dir=${encodeURIComponent(dir)}`, { method: 'POST' });

const post = (path, payload) =>
  json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// What this project's .claude directory holds, and how to add to it.
export const getAuthoring = (projectId) =>
  json(`/api/authoring?project=${encodeURIComponent(projectId)}`);
export const getLibrary = (projectId) =>
  json(`/api/library?project=${encodeURIComponent(projectId)}`);

export const createThing = (payload) => post('/api/create', payload);
export const applyProposal = (proposal) => post('/api/apply', { proposal });
export const saveItem = (payload) => post('/api/library/save', payload);
export const deleteItem = (payload) => post('/api/library/delete', payload);
export const openEditor = (projectId) => post('/api/open-editor', { projectId });

export const folders = (payload) =>
  json('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// --- casting ---------------------------------------------------------------

// Most of the pack's sixteen roles are real agent types, so a backend-engineer
// is drawn as the backend engineer rather than an arbitrary colour. These are
// the ones this workspace names differently.
const ALIASES = {
  'security-engineer': 'security-reviewer',
  'tech-writer': 'docs-writer',
  'ui-ux-designer': 'design-agent',
  'software-architect': 'product-manager',
  debugger: 'bug-triage',
  refactorer: 'code-reviewer',
  'general-purpose': 'ops-monitor',
  'statusline-setup': 'devops-engineer',
  Explore: 'data-analyst',
  Plan: 'product-manager',
  claude: 'product-manager',
  codex: 'backend-engineer',
  'codex-agent': 'frontend-engineer',
};

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

// The character this agent would like, before anybody else has claimed one.
function preferredRole(agent, roles) {
  const type = agent.agentType ?? '';
  if (roles.includes(type)) return type;
  if (ALIASES[type] && roles.includes(ALIASES[type])) return ALIASES[type];
  // Every session has the same agent type, so hash the session instead or
  // they would all be drawn as the same person.
  return roles[hash(agent.isSession ? agent.id : type) % roles.length];
}

/** Cast a whole room at once, so nobody shares a face.
 *
 * Preferences are honoured first — a backend-engineer should be drawn as the
 * backend engineer — and anyone whose choice is taken gets the next free role
 * rather than a duplicate. Agents are cast in a stable order, so a new arrival
 * never reshuffles the people already there.
 */
export function castRoom(agents, roles) {
  const cast = new Map();
  const taken = new Set();

  for (const agent of agents) {
    const wanted = preferredRole(agent, roles);
    if (taken.has(wanted)) continue;
    taken.add(wanted);
    cast.set(agent.id, wanted);
  }

  for (const agent of agents) {
    if (cast.has(agent.id)) continue;
    const start = hash(agent.id) % roles.length;
    let role = roles[start];
    for (let i = 1; i <= roles.length && taken.has(role); i++) {
      role = roles[(start + i) % roles.length];
    }
    taken.add(role);
    cast.set(agent.id, role);
  }

  return cast;
}

// A session carries its own name, which is what tells two sessions in the same
// project apart. "claude" would make them identical.
export const nameFor = (agent, parent) =>
  agent.isSession ? agent.sessionName ?? 'Claude Code' : agent.provider === 'codex' ? 'Codex agent' : `${parent?.sessionName ?? agent.sessionName ?? 'Claude Code'} › ${agent.agentType || 'subagent'}`;

/** Name a whole room, so no two people answer to the same thing.
 *
 * Two sessions started in the same directory share a name, and two subagents
 * of one type share theirs. Later arrivals are numbered, in the order they
 * actually started, so an existing name never changes when somebody new
 * turns up.
 */
export function labelRoom(agents) {
  const names = new Map();
  const seen = new Map();

  for (const agent of agents) {
    const base = nameFor(agent, agents.find(a => a.isSession && a.sessionId === agent.sessionId));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    names.set(agent.id, n === 1 ? base : `${base} ${n}`);
  }
  return names;
}

// MCP tools arrive as "mcp__plugin_playwright_playwright__browser_evaluate",
// which overflows anything it is put in. Show "playwright: browser_evaluate".
export function toolLabel(name) {
  if (!name) return name;
  const m = name.match(/^mcp__(?:plugin_)?(.+?)__(.+)$/);
  if (!m) return name;
  return `${m[1].split('_').pop()}: ${m[2]}`;
}

// Which of the simulation's commands this agent's state corresponds to.
export function commandFor(agent) {
  if (agent.status === 'done') return 'celebrate';
  if (agent.needsYou) return 'sit';       // stays seated, asking for input
  if (agent.waiting) return 'coffee';     // handed control back: on a break
  return agent.tool || agent.active ? 'work' : 'rest';     // only real tool activity looks like work
}

export function taskFor(agent) {
  if (agent.description) return agent.description;
  if (agent.tool) return toolLabel(agent.tool);
  return agent.needsYou ? 'Waiting on you' : 'Thinking';
}

// --- live connection -------------------------------------------------------

// The panel server pushes one event per change. The events carry enough to
// know something happened, but the room is re-read rather than folded again
// here: the server already owns that fold, and duplicating it would give two
// answers to the same question.
export function connect({ onChange, onError, filter }) {
  const source = new EventSource('/api/stream');
  source.onmessage = message => {
    let event; try { event = JSON.parse(message.data); } catch { return; }
    if (!filter || filter(event)) onChange(event);
  };
  source.onerror = err => onError?.(err);
  return () => { source.onmessage = null; source.close(); };
}
