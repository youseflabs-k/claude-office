import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// An identity is the display name and character chosen for one person on the
// floor. It is keyed by agent id, not agent type: naming the backend-engineer
// at desk three must not rename every backend-engineer in the project.
//
// The project id is part of the key so the same agent is free to be a
// different person in a different project.

export const identityKey = (projectId, agentId) => `${projectId}::${agentId}`;

export async function loadIdentities(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveIdentities(file, identities) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(identities, null, 2));
}

export function setIdentity(identities, { projectId, agentId, agentType, name, character }) {
  if (!projectId || !agentId) throw new Error('projectId and agentId are required.');

  const key = identityKey(projectId, agentId);
  const trimmed = (name ?? '').trim();

  if (trimmed.length > 40) throw new Error('Keep the name under 40 characters.');

  const next = { ...(identities[key] ?? {}), projectId, agentId, agentType };
  if (trimmed) next.name = trimmed;
  else delete next.name;            // cleared: fall back to the agent type
  if (character) next.character = character;

  // Nothing worth storing once both overrides are gone.
  if (!next.name && !next.character) delete identities[key];
  else identities[key] = next;

  return identities[key] ?? null;
}
