---
id: first-agent
title: Your First Agent
sidebar_position: 1
---

# Your First Agent

This walkthrough creates a coding assistant from scratch and shows you exactly what happens when you send it a task.

## 1. Start the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You'll see an empty grid — your office.

## 2. Create the assistant

Click **+ New Agent** in the top-right corner. Fill in:

| Field | What to enter |
|-------|--------------|
| Name | `assistant` |
| Mission | `You are a helpful coding assistant. When asked a question, answer clearly. When asked to build something, write clean working code and explain your choices.` |
| Avatar color | Anything you like |

Click **Create**. The assistant appears in the top-left room.

What just happened behind the scenes:
- The server created a folder at `workspaces/default/assistant/`
- It wrote identity files (who the assistant is, how it should work)
- The assistant was saved to disk and is now ready to receive tasks

## 3. Send it a task

Click on the assistant's room to open the chat. Type:

```
Write a Python function that checks if a string is a valid email address.
Include a docstring and 3 test cases.
```

Press **Enter**. Watch what happens:

- The status badge switches to **Running**
- Text starts streaming in — word by word, in real time
- When the assistant uses a tool (like writing a file), a badge appears showing what it did

The response will look something like:

```python
import re

def is_valid_email(email: str) -> bool:
    """
    Check if a string is a valid email address.

    Args:
        email: The string to validate.

    Returns:
        True if valid, False otherwise.
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


# Test cases
assert is_valid_email("user@example.com") == True
assert is_valid_email("invalid-email") == False
assert is_valid_email("user@.com") == False
```

When it finishes, the status returns to **Idle**.

## 4. Ask a follow-up

The assistant remembers your conversation. Send:

```
Now add support for international domain names (e.g. münchen.de).
```

It picks up the context from the previous message and refines its answer — no need to explain what you were working on.

## 5. Give it more capabilities

By default, a new assistant can read and write text but can't execute shell commands. To let it run code:

1. Click the assistant's name (not the room) to open the **Agent Sidebar**
2. Go to the **Permissions** tab
3. Add `Bash` to the allow list

Now send:

```
Run the test cases you wrote and show me the output.
```

The assistant will execute the code and show you the actual result — not just what it predicts the result will be.

## 6. Restart the server and come back

Stop the server with `Ctrl+C`. Start it again:

```bash
npm run dev
```

Open the browser. Your assistant is still there — same room, same conversation history, same state. The session is saved to disk and resumes automatically.

Send:

```
What did we build in our last conversation?
```

It remembers.
