# Claude and Codex live sessions

Both providers share `/api/state` and the local `/api/stream` event feed. Each
pushed room snapshot applies immediately; HTTP refreshes are a reconnect fallback.
Real work takes effect immediately at the agent's desk. Idle external agents stay
on coffee, rest, reading and social activities until real work arrives.

Codex is monitored read-only from recent local rollout files under
`$CODEX_HOME/sessions` (default `~/.codex/sessions`). Threads and spawned agents
are attached to the most specific imported project matching their working directory.
Recent Codex workspaces can also be imported through navigation. Internal guardian
threads and archived sessions are excluded. The adapter uses actual task lifecycle,
tool and token events; it never resumes a thread or sends a prompt. The local rollout
format can evolve, so the parser ignores unknown records safely. Sessions without
activity for ten minutes leave the scene. Files are checked every 400 ms; directory
listings refresh every 1.5 seconds.

Official supported thread listing/read APIs are documented at
https://learn.chatgpt.com/docs/app-server. A separate app-server process reports
its own runtime state, so this monitor uses local activity logs for existing sessions.

The output panel streams a recent tail of at most 120 entries. Claude tail reads
are bounded to 512 KiB and Codex reads to 1 MiB. Displayed messages are limited to
4,000 characters; original transcript files are never changed. A fallback refresh
runs every 1.5 seconds, with concurrent requests coalesced and aborted on close.

Single-click a character, label or team card to select it and show Details.
Double-click to show output. The selection ring and highlighted label identify the
selected character. Panel controls hide navigation, team, details and camera tools;
the eye button hides all interface panels while leaving the scene interactive.

Idle live agents rotate through lounge rest, coffee, reading, garden benches,
courtyard walks, and desk rest without typing. New real activity interrupts leisure.
Agents needing user input remain seated, raise their right hand, and keep a visible
attention bubble until the backend clears it. A quiet completion chime plays after browser audio is unlocked by a user gesture; Settings can mute it.

Claude labels follow Cubicle's working-folder session names and
`folder › agent type` subagent names; duplicate labels receive a number.
Reference: https://github.com/caglarutkuguler/cubicle/blob/main/bin/cubicle-hook.js

Claude registry busy/idle and subagent start/stop signals own the active turn.
Clearing a tool label never means idle: thinking, background work, and API retry
backoff keep agents at their desks. Live updates change telemetry immediately,
but movement always follows pathfinding and sit/stand transitions. A verified
busy-to-idle completion shows “Task done” for 12 seconds and emits one chime;
initial idle snapshots and repeated updates do not emit notifications.

Claude registry idle is cross-checked against bounded transcript activity metadata.
A pending user prompt with no completed assistant response remains active, even
if the registry says idle during an API retry. Tool-use/thinking records and API
error records cannot complete a turn. Bootstrap reads at most 512 KiB of activity
metadata without replaying messages, token counts or tools.

Claude's explicit `[Request interrupted by user]` and
`[Request interrupted by user for tool use]` records clear pending activity and
allow idle routines. Interruption is not successful completion and emits no chime.

Attention detection uses actual blocking input signals: Claude's AskUserQuestion
tool and permission prompts. A question written in an ordinary final response
completes the task and leaves the agent idle. Matching tool answers, a new user
prompt, or interruption clear the pending request. Pending questions show the
actual question, a raised hand, and “Needs you” in labels, team cards, and Details.

Notification sounds now include a distinct attention chime. Each request alerts
once, with simultaneous completion notifications suppressed. If browser audio is
locked, Enable sounds appears and plays the pending alert after a user gesture.
Settings → Notification sounds mutes both attention and completion tones.
