---
allowed-tools: Bash
description: Open the Claude Office dashboard
user-invocable: true
---

# /panel

Start the Claude Office server and open the dashboard in the browser.

## Instructions

Run the server in the background:

`node "${CLAUDE_PLUGIN_ROOT}/server/start.js"`

It prints a single JSON line containing the URL, then keeps running until stopped.
Tell the user the dashboard is open and give them the URL as a fallback in case the
browser did not launch. Do not wait for the process to exit.
