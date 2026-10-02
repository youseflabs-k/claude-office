import { readFile, writeFile, mkdir, readdir, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve, sep } from 'node:path';

// Everything the panel can read or write for a project lives under its
// .claude directory, plus CLAUDE.md at the project root. Any path derived
// from client input is resolved and checked against those two before use.
function guard(projectPath, target) {
  const root = resolve(projectPath);
  const claudeDir = join(root, '.claude');
  const rulesFile = join(root, 'CLAUDE.md');
  const full = resolve(target);
  const inClaude = full === claudeDir || full.startsWith(claudeDir + sep);
  if (!inClaude && full !== rulesFile) {
    throw new Error('That path is outside this project .claude directory.');
  }
  return full;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Front matter is preserved verbatim on edit. The panel edits whole files
// rather than reconstructing them, so hand-tuned fields survive.
function splitFrontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { front: null, body: text };
  return { front: match[1], body: text.slice(match[0].length) };
}

function describe(front, fallback) {
  if (!front) return fallback;
  const line = front.split('\n').find((l) => l.startsWith('description:'));
  return line ? line.slice('description:'.length).trim() : fallback;
}

// ---------- read ----------

export async function readLibrary(projectPath) {
  const dir = join(projectPath, '.claude');
  const items = [];

  const addFile = async (kind, file, id, label) => {
    let content = '';
    try {
      content = await readFile(file, 'utf8');
    } catch {
      return;
    }
    const { front } = splitFrontMatter(content);
    items.push({
      kind,
      id,
      label,
      file,
      description: describe(front, ''),
      content,
      bytes: Buffer.byteLength(content),
    });
  };

  try {
    for (const entry of await readdir(join(dir, 'agents'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.replace(/\.md$/, '');
      await addFile('agent', join(dir, 'agents', entry.name), name, name);
    }
  } catch { /* no agents dir */ }

  try {
    for (const entry of await readdir(join(dir, 'skills'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      await addFile('skill', join(dir, 'skills', entry.name, 'SKILL.md'), entry.name, entry.name);
    }
  } catch { /* no skills dir */ }

  try {
    for (const entry of await readdir(join(dir, 'commands'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.replace(/\.md$/, '');
      await addFile('flow', join(dir, 'commands', entry.name), name, `/${name}`);
    }
  } catch { /* no commands dir */ }

  const rulesFile = join(projectPath, 'CLAUDE.md');
  if (await exists(rulesFile)) {
    await addFile('rule', rulesFile, 'CLAUDE', 'CLAUDE.md');
  }

  items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return items;
}

// ---------- write ----------

// Agents and skills are self-contained, so saving applies immediately.
// Flows and rules are shared and git-tracked, so the caller previews first.
export const APPLIES_DIRECTLY = new Set(['agent', 'skill']);

export async function saveItem(projectPath, { kind, file, content }) {
  const target = guard(projectPath, file);
  if (!content || !content.trim()) throw new Error('Refusing to write an empty file.');

  const before = (await exists(target)) ? await readFile(target, 'utf8') : null;
  if (!APPLIES_DIRECTLY.has(kind)) {
    return { applied: false, proposal: { kind, file: target, content, before } };
  }

  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content);
  return { applied: true, file: target };
}

export async function deleteItem(projectPath, { kind, file }) {
  const target = guard(projectPath, file);
  if (kind === 'rule') {
    throw new Error('CLAUDE.md is not deletable from here. Edit it instead.');
  }
  // A skill is a directory; removing only SKILL.md would leave a broken shell.
  const victim = kind === 'skill' ? resolve(join(target, '..')) : target;
  guard(projectPath, victim);
  await rm(victim, { recursive: true, force: true });
  return { deleted: victim };
}

// ---------- assisted authoring ----------

const PROMPTS = {
  agent: (brief) => `Write the complete contents of a Claude Code subagent definition file.

Requirements:
- Start with YAML front matter delimited by ---, containing: name (lowercase-hyphenated), description (one sentence describing WHEN to use this agent), and tools (a comma-separated list chosen from Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch).
- After the front matter, write the system prompt in markdown: the agent's role, how it works, and what it should output.
- Be specific and concise. No emojis.

The agent should: ${brief}

Output ONLY the file contents. No code fences, no commentary.`,

  skill: (brief) => `Write the complete contents of a Claude Code SKILL.md file.

Requirements:
- Start with YAML front matter delimited by ---, containing: name (lowercase-hyphenated) and description (one sentence starting with "Use when..." describing the trigger).
- After the front matter, write the skill body in markdown: concrete conventions, patterns, or steps. Prefer specifics and short examples over general advice. No emojis.

The skill should cover: ${brief}

Output ONLY the file contents. No code fences, no commentary.`,

  flow: (brief) => `Write the complete contents of a Claude Code slash command file.

Requirements:
- Start with YAML front matter delimited by ---, containing: description (one short sentence) and allowed-tools (a comma-separated list).
- After the front matter, write a markdown heading with the command name, then clear step-by-step instructions addressed to Claude. No emojis.

The command should: ${brief}

Output ONLY the file contents. No code fences, no commentary.`,

  rule: (brief) => `Write a short section to append to a project CLAUDE.md file.

Requirements:
- A markdown heading followed by concise, imperative bullet points.
- Rules an AI assistant should follow when working in this codebase.
- Specific and actionable. No emojis, no preamble.

The rules should cover: ${brief}

Output ONLY the markdown section. No code fences, no commentary.`,

  improve: (existing) => `Improve the following Claude Code configuration file.

Make the description sharper about WHEN it applies, tighten vague language into
specifics, and fix any structural problems. Preserve the author's intent and
keep every front matter field that is already present. No emojis.

Output ONLY the improved file contents. No code fences, no commentary.

--- current file ---
${existing}`,
};

// Uses the claude CLI already on PATH, which carries the user's existing
// Claude Code login. No API key and no extra dependency, and it bills to
// their plan rather than separately.
export function assist({ mode, kind, brief, existing, cwd }) {
  const prompt = mode === 'improve' ? PROMPTS.improve(existing) : PROMPTS[kind]?.(brief);
  if (!prompt) throw new Error(`Cannot generate a "${kind}".`);

  return new Promise((resolvePromise, reject) => {
    execFile(
      'claude',
      ['-p', prompt, '--max-turns', '1'],
      { cwd, timeout: 120000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const why = err.killed
            ? 'Claude took too long to respond (over 2 minutes).'
            : (stderr || err.message).trim();
          return reject(new Error(why));
        }
        // Strip fences if the model added them despite instructions.
        const text = stdout.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
        if (!text) return reject(new Error('Claude returned nothing.'));
        resolvePromise({ content: text });
      },
    );
  });
}

// Opens a project folder in VS Code. The `code` CLI is often not installed
// even when the app is, so macOS goes through `open -a` and other platforms
// fall back to the CLI.
export function openInEditor(projectPath) {
  const [cmd, args] = process.platform === 'darwin'
    ? ['open', ['-a', 'Visual Studio Code', projectPath]]
    : ['code', [projectPath]];

  return new Promise((resolvePromise, reject) => {
    execFile(cmd, args, { timeout: 15000 }, (err) => {
      if (err) {
        reject(new Error(
          process.platform === 'darwin'
            ? 'Could not open VS Code. Is it installed in /Applications?'
            : 'Could not run the "code" command. Is it on your PATH?'));
        return;
      }
      resolvePromise({ opened: projectPath });
    });
  });
}

export async function assistAvailable() {
  return new Promise((resolvePromise) => {
    execFile('claude', ['--version'], { timeout: 8000 }, (err, stdout) =>
      resolvePromise(err ? { available: false } : { available: true, version: stdout.trim() }));
  });
}
