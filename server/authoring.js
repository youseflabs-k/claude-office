import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

// Write policy, decided up front:
//   agents, skills  -> direct write. Self-contained files, low blast radius.
//   flows, rules    -> propose a diff, apply only on explicit confirm.
//                      CLAUDE.md and settings.json are shared, git-tracked and
//                      device-synced, so silent edits there are not acceptable.

const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/;

export function validateName(name) {
  if (!name || !SLUG.test(name)) {
    return 'Use lowercase letters, numbers and hyphens (max 49 chars).';
  }
  return null;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listAuthoring(projectPath) {
  const dir = join(projectPath, '.claude');
  const read = async (sub, filter) => {
    try {
      return (await readdir(join(dir, sub), { withFileTypes: true }))
        .filter(filter)
        .map((e) => e.name.replace(/\.md$/, ''));
    } catch {
      return [];
    }
  };

  return {
    agents: await read('agents', (e) => e.isFile() && e.name.endsWith('.md')),
    skills: await read('skills', (e) => e.isDirectory()),
    flows: await read('commands', (e) => e.isFile() && e.name.endsWith('.md')),
    hasRules: await exists(join(projectPath, 'CLAUDE.md')),
  };
}

// ---------- direct writes ----------

export async function createAgent(projectPath, { name, description, model, tools, prompt }) {
  const invalid = validateName(name);
  if (invalid) throw new Error(invalid);

  const dir = join(projectPath, '.claude', 'agents');
  const file = join(dir, `${name}.md`);
  if (await exists(file)) throw new Error(`An agent named "${name}" already exists.`);

  const front = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    ...(model ? [`model: ${model}`] : []),
    ...(tools && tools.length ? [`tools: ${tools.join(', ')}`] : []),
    '---',
    '',
  ].join('\n');

  await mkdir(dir, { recursive: true });
  await writeFile(file, `${front}${prompt.trim()}\n`);
  return { file };
}

export async function createSkill(projectPath, { name, description, body }) {
  const invalid = validateName(name);
  if (invalid) throw new Error(invalid);

  const dir = join(projectPath, '.claude', 'skills', name);
  const file = join(dir, 'SKILL.md');
  if (await exists(file)) throw new Error(`A skill named "${name}" already exists.`);

  const front = ['---', `name: ${name}`, `description: ${description}`, '---', ''].join('\n');

  await mkdir(dir, { recursive: true });
  await writeFile(file, `${front}${body.trim()}\n`);
  return { file };
}

// ---------- proposed writes ----------

export async function proposeFlow(projectPath, { name, description, body }) {
  const invalid = validateName(name);
  if (invalid) throw new Error(invalid);

  const file = join(projectPath, '.claude', 'commands', `${name}.md`);
  if (await exists(file)) throw new Error(`A flow named "/${name}" already exists.`);

  const content = [
    '---',
    `description: ${description}`,
    '---',
    '',
    `# /${name}`,
    '',
    body.trim(),
    '',
  ].join('\n');

  return { kind: 'flow', file, content, before: null };
}

export async function proposeRule(projectPath, { text }) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('A rule needs some text.');

  const file = join(projectPath, 'CLAUDE.md');
  let before = null;
  try {
    before = await readFile(file, 'utf8');
  } catch {
    before = null;
  }

  const addition = `\n${trimmed}\n`;
  const content = before === null
    ? `# Project instructions\n${addition}`
    : `${before.replace(/\s*$/, '')}\n${addition}`;

  return { kind: 'rule', file, content, before };
}

// Applies a proposal that the user has seen and confirmed.
export async function applyProposal({ file, content }) {
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
  return { file };
}
