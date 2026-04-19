---
id: first-agent
title: Your First Agent
sidebar_position: 1
---

# Your First Agent

This walkthrough creates a coding assistant agent from scratch, sends it a real task, and shows you what happens under the hood.

## 1. Start the server

```bash
npm run dev
```

You'll see two processes start:
- Vite dev server on **http://localhost:5173**
- Express + Socket.IO on **http://localhost:3001**

Open [http://localhost:5173](http://localhost:5173). You'll see an empty 5×3 office grid.

## 2. Create the agent

Click **+ New Agent** in the top-right HUD. Fill in:

| Field | Value |
|-------|-------|
| Name | `assistant` |
| Mission | `You are a helpful coding assistant. When asked a question, you answer clearly and concisely. When asked to build something, you write clean, working code and explain your choices.` |
| Avatar color | Any color you like |

Click **Create**. The agent appears in room 0 (top-left) of the grid with status `idle`.

Under the hood, the server:
1. Assigned the agent to the first available room
2. Created `workspaces/default/assistant/` with SOUL.md, USER.md, OPS.md, MEMORY.md, TOOLS.md
3. Persisted the agent to `workspaces/default/agents.json`
4. Emitted `agent:created` via Socket.IO — your browser grid updated in real time

## 3. Chat with the agent

Click on the agent's room to open the **ChatModal**. Type this message:

```
Write a Python function that checks if a string is a valid email address.
Include a docstring and 3 test cases.
```

Press **Enter** or click **Send**.

The agent starts immediately. Watch the UI:

1. **Status badge** changes from `idle` → `running`
2. **Stream output** begins — text chunks arrive via `agent:stream` events and render in real time
3. If the agent uses tools (e.g., writes a test file to disk), **tool call badges** appear:
   ```
   ▶ Write  client/test_email.py
   ✓ Write  done
   ```
4. When done, status returns to `idle`

**Expected response** (will vary):

```python
import re

def is_valid_email(email: str) -> bool:
    """
    Check if a string is a valid email address.

    Args:
        email: The string to validate.

    Returns:
        True if the string matches a basic email pattern, False otherwise.
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


# Test cases
assert is_valid_email("user@example.com") == True
assert is_valid_email("invalid-email") == False
assert is_valid_email("user@.com") == False
```

## 4. Ask a follow-up

The session is persistent — the agent remembers the conversation. Send a follow-up:

```
Now add support for checking that the domain has at least one dot.
```

The agent picks up the context from the previous turn and refines its answer without you repeating yourself.

## 5. Inspect the workspace

After the first conversation, the agent's workspace is on disk at:

```
workspaces/default/assistant/
├── SOUL.md          ← "You are a helpful coding assistant..."
├── USER.md          ← operator context
├── OPS.md           ← how to do work
├── MEMORY.md        ← empty index (no memories yet)
├── TOOLS.md         ← available tools
├── memory/          ← append-only logs (empty until agent writes here)
└── .claude/
    └── settings.json  ← { "permissions": { "allow": [...] } }
```

You can edit `SOUL.md` directly to change the agent's personality, then send another message — the new identity takes effect immediately on the next run.

## 6. Permissions

By default, a new agent gets a conservative set of tools. To let it execute shell commands:

1. Open **AgentSidebar** (click the agent name, not the room)
2. Go to the **Permissions** tab
3. Add `Bash` to the allow list

Or via the API:

```bash
curl -X POST http://localhost:3001/api/agents/<agentId>/permissions \
  -H "Content-Type: application/json" \
  -d '{ "permission": "Bash" }'
```

Now send:

```
Run the Python test cases you wrote and show me the output.
```

The agent will use `Bash` to run `python3` and show you the results.

## 7. Restart the server

Stop the server with `Ctrl+C`. Restart:

```bash
npm run dev
```

Open the browser again. The agent is still there — its status is `idle`, conversation history is intact. The SDK session ID is stored in `agents.json`, so the agent can resume right where it left off.

Send another message:

```
What did we build in our last conversation?
```

The agent remembers everything.
