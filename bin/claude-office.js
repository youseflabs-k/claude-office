#!/usr/bin/env node
// The command line entry point: `npx @yousef-labs/claude-office`.
//
// Everything it does is start the panel server, which serves the studio and
// watches ~/.claude. Paths inside the server resolve from its own location, so
// it does not care which directory you run this from.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const has = (...names) => names.some((n) => argv.includes(n));

function valueOf(...names) {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i !== -1 && argv[i + 1]) return argv[i + 1];
    const inline = argv.find((a) => a.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
  }
  return null;
}

if (has('-h', '--help')) {
  console.log(`
  claude-office — a live 3D office for your Claude Code sessions

  Usage
    npx @yousef-labs/claude-office [options]

  Options
    -p, --port <number>   Port to listen on (default 7878)
        --no-open         Do not open a browser
    -v, --version         Print the version
    -h, --help            Show this

  The studio reads ~/.claude to see which sessions and subagents are running.
  It is read-only: nothing is sent anywhere, and the server binds to loopback.
`);
  process.exit(0);
}

if (has('-v', '--version')) {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(join(HERE, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

const port = valueOf('-p', '--port');
if (port) {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    console.error(`Not a usable port: ${port}`);
    process.exit(1);
  }
  process.env.CLAUDE_OFFICE_PORT = port;
}

if (has('--no-open')) process.env.CLAUDE_OFFICE_NO_OPEN = '1';

// Node 20.19 is the floor, matching what the bundled studio was built for.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Node 20.19 or newer is required (found ${process.versions.node}).`);
  process.exit(1);
}

await import(join(HERE, '..', 'server', 'start.js'));
