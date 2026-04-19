---
id: troubleshooting
title: Troubleshooting
sidebar_position: 6
---

# Troubleshooting

Common issues and how to fix them.

---

## API key not set or invalid

**Symptom:** Agent immediately returns to `idle` with no output. Browser console shows `401` on `/api/agents`.

**Fix:**

1. Check `server/.env` exists and contains:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. Verify the key is valid at [console.anthropic.com](https://console.anthropic.com/)
3. Restart the server — `.env` is read on startup, not hot-reloaded

```bash
# Verify the env file is being read
grep ANTHROPIC server/.env
```

---

## Port conflicts

**Symptom:** `Error: listen EADDRINUSE :::3001` or `:::5173`.

**Fix — change the server port:**

```env
# server/.env
PORT=3002
```

**Fix — kill the conflicting process:**

```bash
# Find what's on port 3001
lsof -ti:3001 | xargs kill
# Or for 5173
lsof -ti:5173 | xargs kill
```

---

## Agent stuck in `running` state

**Symptom:** Agent shows `running` indefinitely. No stream output. No error in UI.

**Cause:** The SDK query hung (network timeout, Anthropic API outage) or the process was killed mid-run.

**Fix:**

1. Check the server logs for an error or hanging promise
2. In the UI, click the agent → **AgentSidebar** → **Force Idle** button (if available)
3. Or via the API:
   ```bash
   curl -X PATCH http://localhost:3001/api/agents/<agentId> \
     -H "Content-Type: application/json" \
     -d '{ "status": "idle" }'
   ```
4. Restart the server — `loadAllAgents()` on startup resets all `running` agents to `idle`

**Prevention:** The server sets `maxTurns: 200` per task. A task that genuinely needs more than 200 tool-call cycles will be cut off. If your agent is hitting this, break the task into smaller steps.

---

## Session not resuming after restart

**Symptom:** After restarting the server, the agent starts a fresh conversation instead of continuing the previous one.

**Cause:** The `sessionId` was not saved to `agents.json` before the server was killed, or the SDK session expired.

**Fix:**

1. Check `workspaces/<teamId>/agents.json` — find your agent and look for `sessionId`:
   ```json
   { "id": "agent_xyz", "sessionId": "sess_abc123", ... }
   ```
   If `sessionId` is `null`, the session was never persisted.

2. Sessions can expire on Anthropic's side after periods of inactivity. If the session is stale, start a new conversation explicitly:
   - In UI: ChatModal → **New Conversation**
   - Via socket: `socket.emit('agent:newConversation', { id: agentId })`

---

## Git worktree errors on repo-backed agents

**Symptom:** Agent creation fails with `fatal: ... is not an empty directory` or `fatal: worktree already exists`.

**Fix — clean up the stale worktree:**

```bash
# List all worktrees
git -C repos/<repo-slug>/ worktree list

# Remove the stale one
git -C repos/<repo-slug>/ worktree remove \
  workspaces/<teamId>/<agentSlug> --force

# Then retry agent creation
```

**Symptom:** `Permission denied (publickey)` during clone.

**Fix:** Check SSH key setup:
```bash
# Test connectivity
ssh -T git@github.com

# Ensure the key is in your SSH agent
ssh-add ~/.ssh/your_key

# Or add it in UI: Settings → SSH Keys
```

---

## Socket.IO connection issues

**Symptom:** UI shows "Disconnected" or agent updates don't appear in real time.

**Fix:**

1. Verify the server is running: `curl http://localhost:3001/api/agents`
2. Check browser console for WebSocket errors
3. If running behind a reverse proxy, ensure WebSocket upgrade headers are forwarded — see [Deployment](./deployment)
4. In development, ensure Vite's proxy config is intact (should proxy `/socket.io` to `localhost:3001`)

---

## Agents not persisting across restarts

**Symptom:** The agents list is empty after a server restart.

**Cause:** `workspaces/` directory is missing or `agents.json` was deleted.

**Fix:**

```bash
# Check if the file exists
ls workspaces/*/agents.json

# Check its contents
cat workspaces/default/agents.json
```

If the file is missing, agents were never created or the directory was cleaned. Re-create agents via the UI.

Make sure the `workspaces/` directory is **not** in `.gitignore` if you want to preserve it across git operations (it's not committed, but should be excluded from `git clean`).

---

## Template instantiation fails

**Symptom:** `POST /api/templates/teams/:id/instantiate` returns an error about a missing agent template.

**Cause:** An agent template referenced in the team template was deleted.

**Fix:**

```bash
# Check the team template
curl http://localhost:3001/api/templates/teams/<teamId> | jq .agentTemplateIds

# Check which agent templates exist
curl http://localhost:3001/api/templates/agents | jq '.[].id'
```

Update the team template to reference only existing agent templates:

```bash
curl -X PATCH http://localhost:3001/api/templates/teams/<teamId> \
  -H "Content-Type: application/json" \
  -d '{ "agentTemplateIds": ["tmpl_abc", "tmpl_def"] }'
```

---

## Delegation not triggering

**Symptom:** Agent output contains `<CALL_AGENT name="X">...</CALL_AGENT>` as literal text instead of triggering a delegation.

**Cause:**
- The target agent name doesn't match exactly (case-sensitive)
- Delegation depth limit (5) was reached
- The tag was inside a code block (` ``` `) — the server only scans text output, not code blocks

**Fix:**

1. Check the target agent's name exactly: `curl http://localhost:3001/api/agents | jq '.[].name'`
2. Ensure the agent's mission tells it to use the exact `name` attribute
3. Check server logs for delegation errors

---

## High memory usage

**Symptom:** Server process grows over time with many active agents.

**Cause:** Stream buffers and tool event history accumulate in memory and are not garbage-collected aggressively.

**Fix:**
- Call `agent:newConversation` on idle agents to clear their stream buffers
- Restart the server periodically — state is fully recovered from disk
- For production, set up a cron job or PM2 `restart` schedule (see [Deployment](./deployment))
