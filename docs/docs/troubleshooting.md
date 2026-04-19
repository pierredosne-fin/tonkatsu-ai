---
id: troubleshooting
title: Troubleshooting
sidebar_position: 6
---

# Troubleshooting

Something not working? This page covers the most common issues and how to fix them.

---

## The app won't start

**Error: `listen EADDRINUSE :::3001`**

Something else is already using port 3001. Either:

- Change the port in `server/.env`: `PORT=3002`
- Or find and stop whatever is using the port:
  ```bash
  lsof -ti:3001 | xargs kill
  ```

**Error: `listen EADDRINUSE :::5173`** — same thing, but for the browser UI port.

---

## Assistants don't respond

**Symptom:** You send a message, the assistant shows "Running" briefly, then goes back to "Idle" with no output.

**Most likely cause:** The API key is missing or invalid.

Check `server/.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

- Make sure the file exists at `server/.env` (not just `.env`)
- Make sure the key is valid at [console.anthropic.com](https://console.anthropic.com/)
- Restart the server after changing the file — it's only read on startup

---

## An assistant is stuck on "Running"

**Symptom:** The assistant shows "Running" indefinitely with no output appearing.

This usually means the connection to the AI timed out or the server was interrupted mid-task.

**Fix:** Restart the server:
```bash
# Stop with Ctrl+C, then:
npm run dev
```

On restart, all assistants in a "Running" state are automatically reset to "Idle". Your conversation history is preserved.

---

## Conversation history is gone after a restart

**Symptom:** The assistant is there, but the conversation history is empty.

The session may have expired on Anthropic's side (this happens after long periods of inactivity), or the session ID wasn't saved before the server stopped.

**Fix:** Start a new conversation — click **New Conversation** in the chat. The assistant will start fresh but keep its identity and memory files.

---

## An assistant won't delegate to another

**Symptom:** You see `<CALL_AGENT name="X">...</CALL_AGENT>` as literal text in the response instead of triggering a delegation.

Common causes:

1. **Wrong name** — the name in the tag must exactly match the target assistant's name (case-sensitive). Check the exact name: look at the room in the office grid.
2. **Inside a code block** — if the tag appears inside triple backticks in the response, the server won't intercept it
3. **Depth limit hit** — delegations are capped at 5 levels deep

---

## The browser shows "Disconnected"

**Symptom:** The office grid shows a disconnected state or doesn't update in real time.

1. Check the server is still running (look at your terminal)
2. Refresh the browser
3. If you're behind a reverse proxy (nginx, Caddy), make sure WebSocket headers are forwarded — see [Deployment](./deployment)

---

## An assistant I deleted is still showing up

Hard-refresh the browser (`Cmd+Shift+R` on Mac, `Ctrl+Shift+R` on Windows). The browser may have cached an older state.

---

## Repo-backed agent won't connect to the repository

**Symptom:** Creating a repo-backed agent fails with a permission or clone error.

1. Check the SSH key is set up — go to **Settings → SSH Keys** in the UI
2. Test the connection from your terminal: `ssh -T git@github.com`
3. Make sure the key has read/write access to the repository

---

## Something else is wrong

Check the server logs in your terminal — errors are printed there with context. If the issue persists, [open an issue on GitHub](https://github.com/pierredosne/my-team/issues).
