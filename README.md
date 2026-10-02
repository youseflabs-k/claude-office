# Claude Office

[![npm](https://img.shields.io/npm/v/@yousef-labs/claude-office)](https://www.npmjs.com/package/@yousef-labs/claude-office)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A520.19-brightgreen)

A live 3D office for your Claude Code sessions. Every running session and
subagent is a character on the floor: they walk in, take a desk, work, get up
for coffee, and leave when they finish. It is driven by what is actually
happening in `~/.claude`, not a simulation.

## Run it

Nothing to install, nothing to build:

```sh
npx @yousef-labs/claude-office
```

It prints the URL and opens your browser.

| | |
| --- | --- |
| `--port 8080` | listen somewhere else (or set `CLAUDE_OFFICE_PORT`) |
| `--no-open` | leave the browser alone |
| `--help` | the rest |

To keep it around:

```sh
npm install -g @yousef-labs/claude-office
claude-office
```

### As a Claude Code plugin

The repository is its own marketplace, so add it and then install from it:

```
/plugin marketplace add youseflabs-k/claude-office
/plugin install claude-office@youseflabs-claude-office
```

Then `/panel` opens the studio.

### From a clone

```sh
git clone https://github.com/youseflabs-k/claude-office.git
cd claude-office && ./start.sh
```

Every route needs Node 20.19 or newer. The studio ships prebuilt, so none of
them compile anything.

## It is read-only

The server reads `~/.claude` to see which sessions are running and tails their
transcripts. It writes nothing there, binds to loopback only, and sends
nothing anywhere. The one exception is deliberate: the project panel can
create agents, skills, flows and rules in a project's `.claude` directory, and
it shows you flows and rules for approval before writing them.

## What it does

**Workspaces are your real projects.** The sidebar lists the Claude projects
you have imported, with folders you can drag projects into, and everything
under `~/.claude` that has not been imported yet.

**People are real sessions.** A session or subagent that starts appears and
walks to a free desk. Running a tool is working; handing control back to you is
a coffee break; finishing is a celebration and a walk to the door. Idle agents
wander — a trip to the lounge, the bar, or just a stretch of the legs.

**Click anyone to read their transcript**, folded the way the CLI folds output,
with your own messages marked.

**The project panel** shows the agents, skills, flows and rules in that
project's `.claude` directory, and lets you add to them. Flows and rules are
proposed for review before they land; agents and skills are new files and apply
directly.

**Open the studio in its own tab** from the toolbar, to leave it running on a
second screen.

## How it fits together

```
server/     Watches ~/.claude. Discovers projects, tails transcripts, folds
            events into room state, and serves it over REST + SSE.
app/        React + Three.js studio. Owns bodies: navigation, seating,
            animation. The server says who exists and what they are doing.
```

The division is deliberate. The server owns the question of who is in the room;
the simulation owns where they are standing. A status arriving every second
never teleports anyone, because repeating a command is a no-op in the engine.

The server is dependency-free Node. The studio uses React, Three.js and Vite.

## Development

```sh
cd app
npm install
npm run dev      # Vite on 5173, proxying /api to the server on 7878
npm test         # engine, navigation, persistence, layouts, roaming
npm run build    # commit the result: the plugin ships it
```

Run `node server/start.js` alongside `npm run dev` so the studio has live data.

## Assets

The character and furniture GLBs come from a Cozy Office asset pack generated
for this project. Scene layout, navigation, the interaction engine and all
application source are original. No fonts, remote textures or provider
credentials are bundled. See `app/docs/ASSET-PROVENANCE.md`.

## Licence

MIT, for the source. See `LICENSE`.
