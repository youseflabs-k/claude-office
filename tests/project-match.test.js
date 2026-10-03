import test from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { resolveProject } from '../server/watcher/project-match.js';

// Placing a session by its working directory is the only thing standing
// between "the project you are working in right now" and an empty room: the
// index is a snapshot taken at startup, so every session begun afterwards
// arrives unknown, with a cwd and nothing else.
//
// Paths are built with join rather than written as literals, so running this
// on Windows exercises Windows separators instead of quietly passing on
// POSIX strings that platform would never produce.

const HOME = join(sep, 'Users', 'x');
const docs = (...parts) => join(HOME, 'Documents', ...parts);

const project = (id, realPath) => ({
  id, realPath, dir: join(HOME, '.claude', 'projects', id),
});

const PROJECTS = {
  a: project('app-creator', docs('App Creator')),
  b: project('music', docs('music_ai_mobil')),
  c: project('nested', docs('App Creator', 'projects', 'claude-office')),
};

test('a session in a project root belongs to it', () => {
  assert.equal(resolveProject(docs('music_ai_mobil'), PROJECTS)?.id, 'music');
});

test('a session in a subdirectory still belongs to the project', () => {
  assert.equal(resolveProject(docs('music_ai_mobil', 'lib', 'core'), PROJECTS)?.id, 'music');
});

// This is the case that makes the longest-path sort load-bearing: the nested
// project is also inside App Creator, and listing order must not decide it.
test('a project nested inside another wins over its parent', () => {
  const inner = docs('App Creator', 'projects', 'claude-office', 'server');
  assert.equal(resolveProject(inner, PROJECTS)?.id, 'nested');
  assert.equal(resolveProject(docs('App Creator', 'docs'), PROJECTS)?.id, 'app-creator');
});

// /app must not claim /app-creator, which is what a bare startsWith would do.
test('a prefix only matches at a path boundary', () => {
  const projects = { a: project('app', join(HOME, 'app')) };
  assert.equal(resolveProject(join(HOME, 'app-creator'), projects), null);
  assert.equal(resolveProject(join(HOME, 'app'), projects)?.id, 'app');
  assert.equal(resolveProject(join(HOME, 'app', 'src'), projects)?.id, 'app');
});

test('a trailing separator on the project path changes nothing', () => {
  const projects = { a: project('app', join(HOME, 'app') + sep) };
  assert.equal(resolveProject(join(HOME, 'app'), projects)?.id, 'app');
  assert.equal(resolveProject(join(HOME, 'app', 'src'), projects)?.id, 'app');
});

test('a directory outside every project belongs to none', () => {
  assert.equal(resolveProject(docs('something-else'), PROJECTS), null);
});

test('nonsense input is refused rather than guessed at', () => {
  for (const cwd of [null, undefined, '', 42, {}, []]) {
    assert.equal(resolveProject(cwd, PROJECTS), null, `cwd ${JSON.stringify(cwd)}`);
  }
  assert.equal(resolveProject(HOME, null), null);
  assert.equal(resolveProject(HOME, {}), null);
});

// A half-written index entry must not take a session down with it.
test('projects missing a path are skipped, not thrown on', () => {
  const projects = {
    broken: { id: 'broken' },
    noDir: { id: 'noDir', realPath: join(HOME, 'app') },
    good: project('good', join(HOME, 'app')),
  };
  assert.equal(resolveProject(join(HOME, 'app'), projects)?.id, 'good');
});

// Windows writes separators the other way round, and its filesystem does not
// care about case. node:path settles both; a string comparison could not.
test('on Windows, separators and case do not decide the answer', { skip: process.platform !== 'win32' }, () => {
  const projects = { a: project('app', 'C:\\Users\\x\\App Creator') };
  assert.equal(resolveProject('C:\\Users\\x\\App Creator\\server', projects)?.id, 'app');
  assert.equal(resolveProject('C:/Users/x/App Creator/server', projects)?.id, 'app');
  assert.equal(resolveProject('c:\\users\\x\\app creator\\server', projects)?.id, 'app');
});
