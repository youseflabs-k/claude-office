import { basename as pathBasename } from 'node:path';
import { assignSeats } from './desks.js';
import { DONE_LINGER_MS } from '../config.js';

// Last path segment. node:path knows both separators on Windows, where a
// hand-rolled split on '/' hands back the whole of C:\Users\x\project.
function basename(path) {
  if (!path) return null;
  return pathBasename(String(path)) || null;
}


export function emptyState() {
  return { sessions: {}, agents: {} };
}

// Pure: no I/O, no mutation of the input. Every subtle seating bug is
// reproducible by replaying an event array through this function.
export function fold(state, event) {
  const sessions = { ...state.sessions };
  const agents = { ...state.agents };

  switch (event.kind) {
    case 'session.start':
      sessions[event.sessionId] = {
        id: event.sessionId,
        projectId: event.projectId ?? null,
        cwd: event.cwd ?? null,
        status: 'idle',
        attention: null,
      };
      // The session itself is someone working, not just a container for
      // subagents. Without this the room looks empty whenever Claude is
      // working directly, which is most of the time.
      agents[event.sessionId] = {
        id: event.sessionId,
        sessionId: event.sessionId,
        projectId: event.projectId ?? null,
        agentType: 'claude',
        provider: 'claude',
        // Named for the directory it works in, the way cubicle does: Claude's
        // own derived name ("app-creator-48") says nothing, whereas the folder
        // does. Fixed at the directory it started in, because renaming
        // somebody every time they cd somewhere is worse than useless.
        sessionName: basename(event.cwd) ?? event.title ?? null,
        description: '',
        model: null,
        status: 'running',
        active: false,
        tool: null,
        tokens: 0,
        isSession: true,
        firstSeenAt: event.at,
      };
      break;

    case 'session.status': {
      const session = sessions[event.sessionId];
      if (session) sessions[event.sessionId] = { ...session, status:event.status, statusAt:event.statusUpdatedAt ?? event.at };

      if (event.status === 'busy') {
        const own = agents[event.sessionId];
        if (own) {
          agents[event.sessionId] = {
            ...own, active: true, waiting: false, idleSince: null,
          };
        }
      }

      // A session is busy precisely because it is waiting on its agents, so
      // going idle means none are still running. Sweep any that never reported
      // stopping: an interrupted or killed agent never writes the tool_result
      // the departure join depends on, and would otherwise sit at a desk
      // forever.
      if (event.status === 'idle') {
        const own = agents[event.sessionId];
        const idleAt = event.statusUpdatedAt ?? event.at;
        if (own?.pendingTurn && !(own.responseCanComplete && own.lastResponseAt >= (own.turnStartedAt ?? 0) && idleAt >= own.lastResponseAt)) break;
        for (const [id, agent] of Object.entries(agents)) {
          // The session's own occupant stays seated when idle - the person is
          // still there, just not typing. Only its subagents are swept.
          if (agent.sessionId === event.sessionId && !agent.isSession
              && agent.status === 'running') {
            agents[id] = { ...agent, status: 'done', active:false, needsYou:false, doneAt: event.at, tool: null };
          }
        }
        if (own) {
          agents[event.sessionId] = {
            ...own,
            tool: null,
            active: false, pendingTurn:false,
            completedAt: own.active && !own.needsYou ? event.at : own.completedAt,
            needsYou: Boolean(own.needsYou && (own.attentionToolId || own.attentionReason === 'permission')),
            ...(!own.attentionToolId && own.attentionReason !== 'permission' ? {attentionText:null,attentionReason:null,attentionAt:null} : {}),
            waiting: true,
            // When the session actually went idle, not when this panel first
            // saw it. A session idle for hours must not look freshly idle
            // every time the panel restarts.
            idleSince: event.statusUpdatedAt ?? own.idleSince ?? event.at,
          };
        }
      }
      break;
    }

    case 'session.cwd': {
      const session = sessions[event.sessionId];
      if (session) sessions[event.sessionId] = { ...session, cwd: event.cwd };
      // The working directory moves; the name does not. Renaming somebody
      // every time they cd into a subdirectory is worse than useless.
      break;
    }

    case 'session.end': {
      const session = sessions[event.sessionId];
      if (session) {
        sessions[event.sessionId] = { ...session, status: 'ended', attention: null };
      }
      // Sweep agents that never reported stopping, so a crashed session does
      // not leave ghosts sitting at desks forever.
      for (const [id, agent] of Object.entries(agents)) {
        if (agent.sessionId === event.sessionId && agent.status !== 'stopped') {
          agents[id] = { ...agent, status: 'stopped' };
        }
      }
      break;
    }

    case 'agent.start': {
      const session = sessions[event.sessionId];
      agents[event.agentId] = {
        id: event.agentId,
        sessionId: event.sessionId,
        projectId: session ? session.projectId : (event.projectId ?? null),
        agentType: event.agentType,
        provider: 'claude',
        description: event.description ?? '',
        model: event.model ?? null,
        status: 'running',
        active: true,
        tool: null,
        tokens: 0,
        firstSeenAt: event.at,
      };
      break;
    }

    case 'agent.activity': {
      const agent = agents[event.agentId];
      if (!agent || event.at < (agent.activityAt ?? 0)) break;
      const next = { ...agent, activityAt:event.at };
      for (const key of ['pendingTurn','turnStartedAt','lastResponseAt','responseCanComplete','needsYou','attentionToolId','attentionReason','attentionText']) if (key in event) next[key]=event[key];
      if (event.answeredToolIds?.includes(agent.attentionToolId)) { next.needsYou=false; next.attentionToolId=null; next.attentionText=null; next.attentionReason=null; next.attentionAt=null; }
      const session = sessions[event.sessionId];
      const idleAt = session?.statusAt ?? 0;
      const confirmed = event.completed && !(agent.isSession && session?.status === 'busy' && session.statusAt > event.at) || agent.isSession && session?.status === 'idle' && next.responseCanComplete && next.lastResponseAt >= (next.turnStartedAt ?? 0) && idleAt >= next.lastResponseAt;
      if (event.interrupted && !(agent.isSession && session?.status === 'busy' && session.statusAt > event.at)) {
        Object.assign(next,{active:false,pendingTurn:false,waiting:true,needsYou:false,tool:null,idleSince:event.at,interruptedAt:event.at});
      } else if (confirmed) {
        Object.assign(next,{active:false,pendingTurn:false,waiting:true,tool:null,idleSince:event.at});
        next.needsYou = Boolean(next.needsYou && next.attentionToolId);
        if (!next.needsYou) Object.assign(next,{attentionText:null,attentionReason:null,attentionAt:null});
        if (agent.active && !next.needsYou) next.completedAt=event.at;
      } else Object.assign(next,{active:true,waiting:false,idleSince:null});
      if (next.needsYou && !agent.needsYou) next.attentionAt=event.at;
      agents[event.agentId]=next;
      break;
    }

    case 'agent.tool': {
      const agent = agents[event.agentId];
      if (agent) agents[event.agentId] = { ...agent, tool: event.tool,
        ...(event.tool ? { active:true, waiting:false, needsYou:event.tool==='AskUserQuestion' || Boolean(agent.attentionToolId), idleSince:null,
          ...(event.tool==='AskUserQuestion' ? {attentionReason:'question',attentionAt:agent.attentionAt ?? event.at} : {}) } : {}) };
      // A tool result clears the tool label, not the enclosing active turn.
      // Thinking, API retries and background tasks stay busy until idle/stop.
      break;
    }

    case 'agent.tokens': {
      const agent = agents[event.agentId];
      if (agent) agents[event.agentId] = { ...agent, tokens: agent.tokens + event.delta };
      break;
    }

    case 'agent.stop': {
      const agent = agents[event.agentId];
      // Finished, not gone. It holds the desk briefly so you can see that it
      // completed rather than it simply disappearing.
      if (agent && agent.status === 'running') {
        agents[event.agentId] = {
          ...agent, status: 'done', active:false, needsYou:false, doneAt: event.at, completedAt:event.at, tool: null,
        };
      }
      break;
    }

    case 'attention': {
      const session = sessions[event.sessionId];
      if (session) sessions[event.sessionId] = { ...session, attention: event.reason };
      const id=event.agentId ?? event.sessionId;
      const own = agents[id];
      if (own) agents[id] = { ...own, needsYou:true, attentionReason:event.reason, attentionAt:event.at };
      break;
    }

    default:
      break;
  }

  return { sessions, agents };
}

export function roomFor(state, projectId, now = Date.now()) {
  const live = Object.values(state.agents).filter((a) => {
    if (a.projectId !== projectId) return false;
    if (a.status === 'done') return now - a.doneAt < DONE_LINGER_MS;
    if (a.status !== 'running') return false;
    // A registered live session remains in the office while idle; only
    // session.end removes it. Its idle routines continue until another turn.
    return true;
  });

  const { desks, porch } = assignSeats(
    live.map((a) => ({ identityKey: a.agentType, firstSeenAt: a.firstSeenAt, agent: a })),
  );

  const flagged = Object.values(state.sessions).find(
    (s) => s.projectId === projectId && s.attention,
  );

  const unwrap = (slot) => (slot ? { ...slot.agent } : null);
  return {
    desks: desks.map(unwrap),
    porch: porch.map(unwrap),
    attention: flagged ? flagged.attention : null,
  };
}
