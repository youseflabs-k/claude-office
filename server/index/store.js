import { readFile, writeFile, rename, readdir, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { probeSession } from './probe.js';

export function emptyIndex() {
  return { version: 1, projects: {}, sessions: {}, agents: {}, offsets: {}, folders: {} };
}

export async function loadIndex(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return { ...emptyIndex(), ...parsed };
  } catch {
    return emptyIndex();
  }
}

// Write to a temp file then rename, so a crash mid-write cannot leave a
// half-written index behind.
export async function saveIndex(file, index) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(index, null, 2));
  await rename(tmp, file);
}

export async function importProject(index, projectDir) {
  const claudeSlug = basename(projectDir);
  const projectId = claudeSlug;
  const files = (await readdir(projectDir)).filter((f) => f.endsWith('.jsonl'));

  const sessionIds = [];
  const agentIds = [];
  let realPath = null;

  for (const file of files) {
    const meta = await probeSession(join(projectDir, file));
    const sessionId = meta.sessionId ?? file.replace(/\.jsonl$/, '');
    if (realPath === null && meta.cwd) realPath = meta.cwd;

    index.sessions[sessionId] = {
      id: sessionId,
      projectId,
      title: meta.aiTitle ?? meta.slug ?? sessionId,
      gitBranch: meta.gitBranch ?? null,
      cwd: meta.cwd ?? null,
      sizeBytes: meta.sizeBytes,
      path: join(projectDir, file),
    };
    sessionIds.push(sessionId);

    const subDir = join(projectDir, sessionId, 'subagents');
    let metaFiles = [];
    try {
      metaFiles = (await readdir(subDir)).filter((m) => m.endsWith('.meta.json'));
    } catch {
      metaFiles = [];
    }

    for (const metaFile of metaFiles) {
      let agentMeta;
      try {
        agentMeta = JSON.parse(await readFile(join(subDir, metaFile), 'utf8'));
      } catch {
        continue;
      }
      const agentId = metaFile.replace(/\.meta\.json$/, '');
      index.agents[agentId] = {
        id: agentId,
        sessionId,
        projectId,
        agentType: agentMeta.agentType ?? 'unknown',
        description: agentMeta.description ?? '',
        model: agentMeta.model ?? null,
        spawnDepth: agentMeta.spawnDepth ?? 1,
        parentAgentId: agentMeta.parentAgentId ?? null,
        toolUseId: agentMeta.toolUseId ?? null,
      };
      agentIds.push(agentId);
    }
  }

  index.projects[projectId] = {
    id: projectId,
    claudeSlug,
    dir: projectDir,
    realPath,
    displayName: realPath ? basename(realPath) : claudeSlug,
    importedAt: new Date().toISOString(),
  };

  return { projectId, sessionIds, agentIds };
}
