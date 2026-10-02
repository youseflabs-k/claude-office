// Watchers and hooks both produce these. The fold cannot tell which produced
// an event, which is what makes the hooks layer genuinely optional.
export const sessionStart = (e) => ({ kind: 'session.start', ...e });
export const sessionStatus = (e) => ({ kind: 'session.status', ...e });
export const sessionEnd = (e) => ({ kind: 'session.end', ...e });
export const sessionCwd = (e) => ({ kind: 'session.cwd', ...e });
export const agentStart = (e) => ({ kind: 'agent.start', ...e });
export const agentTool = (e) => ({ kind: 'agent.tool', ...e });
export const agentTokens = (e) => ({ kind: 'agent.tokens', ...e });
export const agentStop = (e) => ({ kind: 'agent.stop', ...e });
export const attention = (e) => ({ kind: 'attention', ...e });
