import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from './http/server.js';
import { createBroadcaster } from './http/sse.js';
import {
  PROJECTS_DIR, PANEL_DIR, INDEX_FILE, ENDPOINT_FILE, IDENTITIES_FILE, PORT,
} from './config.js';
import { discoverProjects } from './index/discover.js';
import { loadIndex, saveIndex, importProject } from './index/store.js';
import { startWatching } from './watcher/index.js';
import { emptyState, fold, roomFor } from './state/fold.js';
import {
  listAuthoring, createAgent, createSkill,
  proposeFlow, proposeRule, applyProposal,
} from './authoring.js';
import {
  readLibrary, saveItem, deleteItem, assist, assistAvailable, openInEditor,
} from './library.js';
import { loadIdentities, saveIdentities, setIdentity } from './identities.js';
import { readTail } from './transcript-read.js';
import { startCodexWatching, importedCodexProject } from './watcher/codex.js';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(here, '..', 'app', 'dist');
// Models and portraits live in the app's public directory and are served from
// there rather than copied into the build, so the plugin ships one copy.
const PUBLIC_DIR = join(here, '..', 'app', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

await mkdir(PANEL_DIR, { recursive: true });

const index = await loadIndex(INDEX_FILE);
const identities = await loadIdentities(IDENTITIES_FILE);
const bus = createBroadcaster();
let state = emptyState();

function sendJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

async function serveStatic(res, file) {
  const ext = file.slice(file.lastIndexOf('.'));
  let body;
  try {
    body = await readFile(join(APP_DIR, file));
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    return res.end(
      'The studio has not been built. Run `npm install && npm run build` in app/.',
    );
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(body);
}

const routes = {
  '/': (req, res) => serveStatic(res, 'index.html'),

  '/api/projects': async (req, res) => {
    await codex.ready;
    sendJson(res, {
      available: [...await discoverProjects(PROJECTS_DIR), ...codex.projects()],
      imported: Object.values(index.projects),
      folders: index.folders,
    });
  },

  '/api/import': async (req, res, url) => {
    const dir = url.searchParams.get('dir');
    if (!dir) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'dir is required' }));
    }
    let result;
    if (dir.startsWith('codex:')) {
      const candidate = codex.projects().find(p => p.dir === dir);
      if (!candidate) return sendError(res, 400, 'That Codex project is not in the discovered local sessions.');
      const project = importedCodexProject(candidate.realPath);
      index.projects[project.id] = project;
      result = { projectId: project.id, sessionIds: [], agentIds: [] };
    } else result = await importProject(index, dir);
    await saveIndex(INDEX_FILE, index);
    watchers.restart();
    sendJson(res, result);
  },

  '/api/state': (req, res, url) => {
    const projectId = url.searchParams.get('project');
    const live = combinedState();
    sendJson(res, projectId ? roomFor(live, projectId) : live);
  },

  '/api/stream': (req, res) => bus.attach(req, res),

  // ---------- identities: who someone is, and what they look like ----------

  '/api/identities': async (req, res) => {
    if (req.method === 'POST') {
      const body = await readBody(req);
      try {
        const saved = setIdentity(identities, body);
        await saveIdentities(IDENTITIES_FILE, identities);
        return sendJson(res, { saved, identities });
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }
    sendJson(res, identities);
  },

  // ---------- transcript tail ----------

  '/api/transcript': async (req, res, url) => {
    const sessionId = url.searchParams.get('session');
    const agentId = url.searchParams.get('agent');
    if (sessionId?.startsWith('codex:')) return sendJson(res, await codex.transcript(agentId ?? sessionId));
    const session = index.sessions[sessionId];
    if (!session) return sendJson(res, { entries: [], source: null });
    sendJson(res, await readTail(session, agentId));
  },

  // ---------- folders ----------

  '/api/folders': async (req, res) => {
    const body = await readBody(req);
    if (body.action === 'create') {
      const id = `f${Date.now().toString(36)}`;
      index.folders[id] = { id, name: body.name, projectIds: [] };
    } else if (body.action === 'assign') {
      for (const folder of Object.values(index.folders)) {
        folder.projectIds = folder.projectIds.filter((p) => p !== body.projectId);
      }
      if (body.folderId && index.folders[body.folderId]) {
        index.folders[body.folderId].projectIds.push(body.projectId);
      }
    } else if (body.action === 'delete') {
      delete index.folders[body.folderId];
    }
    await saveIndex(INDEX_FILE, index);
    sendJson(res, { folders: index.folders });
  },

  // ---------- authoring ----------

  '/api/authoring': async (req, res, url) => {
    const project = index.projects[url.searchParams.get('project')];
    if (!project?.realPath) return sendJson(res, { agents: [], skills: [], flows: [], hasRules: false });
    sendJson(res, await listAuthoring(project.realPath));
  },

  '/api/create': async (req, res) => {
    const body = await readBody(req);
    const project = index.projects[body.projectId];
    if (!project?.realPath) {
      return sendError(res, 400, 'That project has no resolved path on disk.');
    }
    try {
      if (body.kind === 'agent') {
        sendJson(res, { applied: true, ...(await createAgent(project.realPath, body)) });
      } else if (body.kind === 'skill') {
        sendJson(res, { applied: true, ...(await createSkill(project.realPath, body)) });
      } else if (body.kind === 'flow') {
        sendJson(res, { applied: false, proposal: await proposeFlow(project.realPath, body) });
      } else if (body.kind === 'rule') {
        sendJson(res, { applied: false, proposal: await proposeRule(project.realPath, body) });
      } else {
        sendError(res, 400, `Unknown kind "${body.kind}".`);
      }
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  '/api/apply': async (req, res) => {
    const body = await readBody(req);
    try {
      sendJson(res, { applied: true, ...(await applyProposal(body.proposal)) });
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  // ---------- library: browse and edit what already exists ----------

  '/api/library': async (req, res, url) => {
    const project = index.projects[url.searchParams.get('project')];
    if (!project?.realPath) return sendJson(res, { items: [] });
    sendJson(res, { items: await readLibrary(project.realPath), root: project.realPath });
  },

  '/api/library/save': async (req, res) => {
    const body = await readBody(req);
    const project = index.projects[body.projectId];
    if (!project?.realPath) return sendError(res, 400, 'That project has no resolved path on disk.');
    try {
      sendJson(res, await saveItem(project.realPath, body));
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  '/api/library/delete': async (req, res) => {
    const body = await readBody(req);
    const project = index.projects[body.projectId];
    if (!project?.realPath) return sendError(res, 400, 'That project has no resolved path on disk.');
    try {
      sendJson(res, await deleteItem(project.realPath, body));
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  // ---------- assisted authoring via the claude CLI ----------

  '/api/assist/status': async (req, res) => sendJson(res, await assistAvailable()),

  // Only ever opens a path that is already an imported project.
  '/api/open-editor': async (req, res) => {
    const body = await readBody(req);
    const project = index.projects[body.projectId];
    if (!project?.realPath) return sendError(res, 400, 'That project has no resolved path on disk.');
    try {
      sendJson(res, await openInEditor(project.realPath));
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  '/api/assist': async (req, res) => {
    const body = await readBody(req);
    const project = index.projects[body.projectId];
    try {
      sendJson(res, await assist({ ...body, cwd: project?.realPath }));
    } catch (err) {
      sendError(res, 400, err.message);
    }
  },

  '/api/hook': (req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let payload = null;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
      const sessionId = payload?.payload?.session_id;
      if (payload?.event === 'PermissionRequest' && sessionId) {
        const event = {
          kind: 'attention', sessionId, reason: 'permission', at: Date.now(),
        };
        handleEvent(event);
      }
      res.writeHead(204);
      res.end();
    });
  },
};

// The built app is a directory of hashed files. Resolve and confine the path
// so a crafted request cannot escape it.
async function serveAsset(req, res, url) {
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) return false;

  const wanted = decodeURIComponent(url.pathname);
  const ext = wanted.slice(wanted.lastIndexOf('.'));

  for (const root of [APP_DIR, PUBLIC_DIR]) {
    const target = resolve(join(root, wanted));
    // Resolve and confine, so a crafted path cannot escape either directory.
    if (target !== root && !target.startsWith(root + sep)) continue;
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(body);
      return true;
    } catch {
      // Try the next root.
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
  return true;
}

function combinedState() {
  const agents = { ...state.agents };
  for (const project of Object.values(index.projects)) for (const agent of codex.agents(project.id)) agents[agent.id] = agent;
  return { ...state, agents };
}
function publishRoom(projectId, event) {
  if (projectId) bus.send({ ...event, projectId, room: roomFor(combinedState(), projectId) });
  else bus.send(event);
}
function handleEvent(event) {
  state = fold(state, event);
  const projectId = event.projectId ?? state.agents[event.agentId ?? event.sessionId]?.projectId ?? state.sessions[event.sessionId]?.projectId;
  publishRoom(projectId,event);
}
const codex = startCodexWatching({ index, onChange: event => {
  for (const project of Object.values(index.projects)) publishRoom(project.id,event);
} });

// Importing a project adds a directory to watch, so the watcher set is rebuilt.
const watchers = (() => {
  let current = startWatching({ index, onEvent: handleEvent });
  return {
    restart() {
      current.stop();
      current = startWatching({ index, onEvent: handleEvent });
    },
    stop() {
      current.stop();
    },
  };
})();

const server = createServer({ routes, fallback: serveAsset });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Either stop whatever is on it, or run ` +
      'with CLAUDE_OFFICE_PORT=<other port>.');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', async () => {
  const { port } = server.address();
  // Hooks are children of Claude Code and cannot inherit this process's
  // environment, so the endpoint is published to a file they can read.
  await writeFile(ENDPOINT_FILE, JSON.stringify({ port }));

  const url = `http://127.0.0.1:${port}/`;
  console.log(JSON.stringify({ type: 'server-started', port, url }));

  // Headless and CI runs do not want a browser window thrown at them.
  if (!process.env.CLAUDE_OFFICE_NO_OPEN) {
    const opener = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  }
});

async function shutdown() {
  watchers.stop();
  codex.stop();
  try {
    await saveIndex(INDEX_FILE, index);
  } catch {
    // best effort
  }
  try {
    await unlink(ENDPOINT_FILE); // never leave a stale endpoint behind
  } catch {
    // already gone
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
