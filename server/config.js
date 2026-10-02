import { homedir } from 'node:os';
import { join } from 'node:path';

// The only place in the codebase that knows Claude's filesystem layout.
export const CLAUDE_DIR = join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');

// Panel state lives beside Claude's data, never inside it.
export const PANEL_DIR = join(CLAUDE_DIR, 'panel');
export const INDEX_FILE = join(PANEL_DIR, 'index.json');

// Hooks run as children of Claude Code, not of this server, so they cannot
// inherit its environment. The port and key are handed over through this file.
export const ENDPOINT_FILE = join(PANEL_DIR, 'endpoint.json');

// Display names and chosen characters, per project and agent type.
export const IDENTITIES_FILE = join(PANEL_DIR, 'identities.json');

// Fixed so the URL is memorable and bookmarkable. Override with
// CLAUDE_OFFICE_PORT if something else already owns it.
export const PORT = Number(process.env.CLAUDE_OFFICE_PORT) || 7878;

export const PROBE_CHUNK = 64 * 1024;
export const DESK_CAPACITY = 4;
export const TAIL_INTERVAL_MS = 150;

// A session parked on an old prompt is not work in progress. Past this it
// leaves its desk, and comes back the moment it is busy again.
export const IDLE_HIDE_MS = 10 * 60 * 1000;

// How long a finished agent stays at its desk showing "done" before leaving.
export const DONE_LINGER_MS = 8 * 1000;
