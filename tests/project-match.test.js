import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProject } from '../server/watcher/project-match.js';

// Placing a session by its working directory is the only thing standing
// between "the project you are working in right now" and an empty room: the
// index is a snapshot taken at startup, so every session begun afterwards
// arrives unknown, with a cwd and nothing else.

const project = (id, realPath) => ({
  id, realPath, dir: `/Users/x/.claude/projects/${id}`,
});

const PROJECTS = {
  a: project('app-creator', '/Users/x/Documents/App Creator'),
  b: project('music', '/Users/x/Documents/music_ai_mobil'),
  c: project('nested', '/Users/x/Documents/App Creator/projects/claude-office'),
};

test('a session in a project root belongs to it', () => {
  assert.equal(resolveProject('/Users/x/Documents/music_ai_mobil', PROJECTS)?.id, 'music');
});

test('a session in a subdirectory still belongs to the project', () => {
  assert.equal(resolveProject('/Users/x/Documents/music_ai_mobil/lib/core', PROJECTS)?.id, 'music');
});

// This is the case that makes the longest-path sort load-bearing: the nested
// project is also inside App Creator, and listing order must not decide it.
test('a project nested inside another wins over its parent', () => {
  const inner = '/Users/x/Documents/App Creator/projects/claude-office/server';
  assert.equal(resolveProject(inner, PROJECTS)?.id, 'nested');
  assert.equal(resolveProject('/Users/x/Documents/App Creator/docs', PROJECTS)?.id, 'app-creator');
});

// /app must not claim /app-creator, which is what a bare startsWith would do.
test('a prefix only matches at a path boundary', () => {
  const projects = { a: project('app', '/Users/x/app') };
  assert.equal(resolveProject('/Users/x/app-creator', projects), null);
  assert.equal(resolveProject('/Users/x/app', projects)?.id, 'app');
  assert.equal(resolveProject('/Users/x/app/src', projects)?.id, 'app');
});

test('a trailing slash on the project path changes nothing', () => {
  const projects = { a: project('app', '/Users/x/app/') };
  assert.equal(resolveProject('/Users/x/app', projects)?.id, 'app');
  assert.equal(resolveProject('/Users/x/app/src', projects)?.id, 'app');
});

test('a directory outside every project belongs to none', () => {
  assert.equal(resolveProject('/Users/x/Documents/something-else', PROJECTS), null);
});

test('nonsense input is refused rather than guessed at', () => {
  for (const cwd of [null, undefined, '', 42, {}, []]) {
    assert.equal(resolveProject(cwd, PROJECTS), null, `cwd ${JSON.stringify(cwd)}`);
  }
  assert.equal(resolveProject('/Users/x', null), null);
  assert.equal(resolveProject('/Users/x', {}), null);
});

// A half-written index entry must not take a session down with it.
test('projects missing a path are skipped, not thrown on', () => {
  const projects = {
    broken: { id: 'broken' },
    noDir: { id: 'noDir', realPath: '/Users/x/app' },
    good: project('good', '/Users/x/app'),
  };
  assert.equal(resolveProject('/Users/x/app', projects)?.id, 'good');
});
