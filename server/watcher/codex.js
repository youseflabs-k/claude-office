import { readdir, stat, open, readFile } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

export const CODEX_DIR = process.env.CODEX_HOME || join(homedir(), '.codex');
const WINDOW_MS = 10 * 60 * 1000;
const CHUNK_BYTES = 512 * 1024;

export function codexProjectFor(cwd, projects) {
  if (!cwd) return null;
  const path = resolve(cwd);
  return projects.filter(p => p.realPath && (path === resolve(p.realPath) || path.startsWith(resolve(p.realPath) + sep)))
    .sort((a,b) => b.realPath.length - a.realPath.length)[0] ?? null;
}

/** Normalize local rollout events. No threads are resumed and no prompts sent. */
export function foldCodex(previous, record) {
  const next = { ...previous }, p = record.payload ?? {};
  const at = Date.parse(record.timestamp) || previous.lastActivityAt || 0;
  next.lastActivityAt = Math.max(previous.lastActivityAt ?? 0, at);
  if (record.type === 'session_meta') {
    next.threadId = p.id ?? p.session_id;
    next.id = `codex:${next.threadId}`; next.sessionId = next.id;
    next.cwd = p.cwd; next.provider = 'codex'; next.parentThreadId = p.parent_thread_id ?? null;
    next.isSession = !(p.parent_thread_id || typeof p.source === 'object' && p.source?.subagent);
    next.agentType = next.isSession ? 'codex' : 'codex-agent';
    next.sessionName = `Codex · ${basename(p.cwd ?? '') || 'Session'}`;
    next.firstSeenAt = Date.parse(p.timestamp) || at;
    next.status = 'running'; next.active = false; next.waiting = true;
    next.tokens = 0; next.tool = null;
  }
  if (record.type === 'turn_context') { next.active = true; next.waiting = false; next.model = p.model ?? next.model; next.cwd = p.cwd ?? next.cwd; }
  if (record.type === 'event_msg') {
    if (p.type === 'task_started' || p.type === 'turn_started') { next.active = true; next.waiting = false; next.idleSince = null; next.needsYou = false; }
    if (['task_complete','turn_complete','turn_aborted','task_interrupted'].includes(p.type)) {
      next.active = false; next.waiting = true; next.tool = null; next.idleSince = at; next.needsYou = false;
    }
    if (p.type === 'token_count') next.tokens = p.info?.total_token_usage?.total_tokens ?? next.tokens;
    if (p.type === 'approval_request' || p.type === 'request_user_input') { next.needsYou = true; next.tool = null; }
    if (p.type === 'item_completed' && p.item?.type === 'agentMessage' && p.item?.phase === 'final') { next.active = false; next.waiting = true; next.tool = null; next.idleSince = at; }
  }
  if (record.type === 'token_usage_record') next.tokens = p.thread_token_usage?.total_tokens ?? next.tokens;
  if (record.type === 'response_item') {
    if (p.type === 'reasoning' || p.type === 'message' && p.role === 'assistant' && p.phase === 'commentary') { next.active = true; next.waiting = false; }
    if (['function_call','custom_tool_call'].includes(p.type)) { next.tool = p.name; next.active = true; next.waiting = false; next.idleSince = null; next.callId = p.call_id; }
    if (['function_call_output','custom_tool_call_output'].includes(p.type) && (!next.callId || p.call_id === next.callId)) next.tool = null;
    if (p.type === 'message' && p.role === 'assistant' && p.phase === 'final') { next.active = false; next.waiting = true; next.tool = null; next.idleSince = at; }
  }
  if (previous.active && !next.active && (['task_complete','turn_complete'].includes(p.type) || p.phase === 'final' || p.item?.phase === 'final')) next.completedAt = at;
  return next;
}

export function codexTranscriptEntry(record) {
  const p = record.payload ?? {};
  if (record.type !== 'response_item') return null;
  if (['function_call', 'custom_tool_call'].includes(p.type)) return { kind: 'tool', tool: p.name, detail: '', at: record.timestamp };
  if (p.type !== 'message' || !['user','assistant'].includes(p.role) || p.phase === 'analysis') return null;
  const text = (p.content ?? []).filter(c => ['input_text','output_text','text'].includes(c.type)).map(c => c.text ?? '').join('\n');
  return text ? { kind: p.role, text, at: record.timestamp } : null;
}
const parse = text => text.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
async function readChunk(path, offset, length) {
  const file = await open(path, 'r');
  try { const buffer = Buffer.alloc(length); const { bytesRead } = await file.read(buffer, 0, length, offset); return buffer.subarray(0, bytesRead).toString('utf8'); }
  finally { await file.close(); }
}

export function startCodexWatching({ index, onChange = () => {}, sessionsDir = join(CODEX_DIR, 'sessions'), interval = 400, now = () => Date.now() }) {
  const cache = new Map(), ignored = new Set(); let stopped = false, scanning = false, lastSignature = '', lastFiles = [], listedAt = 0;
  async function files() {
    if (now() - listedAt < 1500 && listedAt) return lastFiles;
    listedAt = now();
    const result = [];
    // Recent folders are enough for live sessions; archived transcripts are excluded.
    for (let day = 0; day < 14; day++) {
      const date = new Date(now() - day * 86400000).toISOString().slice(0,10).split('-');
      const dir = join(sessionsDir, ...date);
      try { for (const entry of await readdir(dir)) if (entry.endsWith('.jsonl')) result.push(join(dir,entry)); } catch { /* Codex may not be installed. */ }
    }
    return lastFiles = result;
  }
  async function scan() {
    if (stopped || scanning) return;
    scanning = true;
    try {
      const present = new Set(await files());
      for (const path of cache.keys()) if (!present.has(path)) cache.delete(path);
      for (const path of present) {
        if (ignored.has(path)) continue;
        let info; try { info = await stat(path); } catch { continue; }
        let entry = cache.get(path);
        if (!entry) {
          const head = await readChunk(path, 0, Math.min(info.size, CHUNK_BYTES));
          const meta = parse(head).find(r => r.type === 'session_meta');
          if (!meta) continue;
          const source = meta.payload?.source;
          if (source?.subagent?.other === 'guardian') { ignored.add(path); continue; }
          entry = { path, meta, agent: foldCodex({}, meta), offset: 0, pending: '', mtime: 0 };
          cache.set(path, entry);
        }
        const project = codexProjectFor(entry.agent.cwd, Object.values(index.projects));
        if (!project) { entry.projectId = null; continue; }
        entry.projectId = project.id;
        if (info.size < entry.offset) { entry.agent = foldCodex({}, entry.meta); entry.offset = 0; entry.pending = ''; }
        if (info.size !== entry.offset) {
          // Bootstrap from a bounded tail, then read appended records without replaying history.
          if (!entry.offset) entry.offset = Math.max(0, info.size - CHUNK_BYTES);
          const start = entry.offset;
          let text = entry.pending + await readChunk(path, start, Math.min(info.size - start, CHUNK_BYTES));
          if (start > 0 && !entry.mtime) text = text.slice(text.indexOf('\n') + 1);
          const end = text.lastIndexOf('\n');
          entry.pending = text.slice(end + 1);
          for (const r of parse(text.slice(0,end + 1))) entry.agent = foldCodex(entry.agent,r);
          entry.offset = start + Math.min(info.size - start, CHUNK_BYTES);
        }
        entry.mtime = info.mtimeMs;
        entry.agent.projectId = entry.projectId;
      }
      const signature = JSON.stringify([...cache.values()].filter(e => e.projectId).map(e => [e.agent.id,e.agent.active,e.agent.tool,e.agent.tokens,e.agent.waiting,e.projectId,e.mtime]));
      if (signature !== lastSignature) { lastSignature = signature; if (!stopped) onChange({kind:'codex.changed'}); }
    } finally { scanning = false; }
  }
  const timer = setInterval(() => scan().catch(() => {}), interval); timer.unref();
  const ready = scan().catch(() => {});
  return {
    ready,
    scan,
    agents(projectId) {
      return [...cache.values()].filter(e => e.projectId === projectId && now() - Math.max(e.agent.lastActivityAt ?? 0, e.mtime) < WINDOW_MS)
        .map(e => ({ ...e.agent, description: e.agent.active ? e.agent.tool ?? 'Codex is working' : 'Taking a break', sessionName: e.agent.isSession ? e.agent.sessionName : 'Codex agent' }));
    },
    projects() {
      const groups = new Map();
      for (const {agent} of cache.values()) {
        if (!agent.cwd) continue;
        const dir = `codex:${agent.cwd}`;
        const group = groups.get(dir) ?? { dir, provider:'codex', realPath:agent.cwd, claudeSlug:basename(agent.cwd), sessionCount:0, lastActiveAt:null };
        group.sessionCount++; group.lastActiveAt = new Date(Math.max(Date.parse(group.lastActiveAt) || 0, agent.lastActivityAt || 0)).toISOString(); groups.set(dir,group);
      }
      return [...groups.values()].filter(p => !codexProjectFor(p.realPath,Object.values(index.projects)));
    },
    async transcript(sessionId) {
      const entry = [...cache.values()].find(e => e.agent.id === sessionId && e.projectId);
      if (!entry) return { entries:[], source:null };
      const info = await stat(entry.path); const offset = Math.max(0,info.size - 2 * CHUNK_BYTES);
      let text = await readChunk(entry.path,offset,info.size-offset); if(offset) text = text.slice(text.indexOf('\n')+1);
      return { entries:parse(text).map(codexTranscriptEntry).filter(Boolean).slice(-120).map(e => e.text?.length > 4000 ? {...e,text:e.text.slice(0,4000)+'\n[Long message trimmed in the live tail.]'} : e), source:entry.path, truncated:offset>0, version:`${info.mtimeMs}:${info.size}` };
    },
    stop() { stopped = true; clearInterval(timer); },
  };
}

export function importedCodexProject(cwd) {
  const realPath = resolve(cwd);
  return { id:`codex-project-${createHash('sha256').update(realPath).digest('hex').slice(0,16)}`, provider:'codex', realPath, displayName:basename(realPath), importedAt:new Date().toISOString() };
}
