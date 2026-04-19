---
id: multi-agent-team
title: Multi-Agent Team
sidebar_position: 2
---

# Multi-Agent Team

This example sets up two assistants that work together: a **coordinator** that manages the work, and a **writer** that handles the actual writing. The coordinator delegates — the writer delivers.

## The idea

Instead of one assistant doing everything, you split responsibilities:

- The **coordinator** (`pm`) understands the goal, breaks it down, and knows when to delegate
- The **writer** (`doc-writer`) is a specialist — given clear instructions, it produces great output

You talk only to the coordinator. It handles the rest.

## Step 1 — Create the writer

Click **+ New Agent**:

**Name:** `doc-writer`

**Mission:**
```
You are a technical documentation writer. When given a topic and source material,
you write clear, developer-friendly documentation in markdown.

Your output always includes:
- A short intro paragraph
- Structured sections with headings
- Code examples where relevant
- A "Key takeaways" section at the end

Be concise. Write for people who scan, not read.
```

## Step 2 — Create the coordinator

Click **+ New Agent** again:

**Name:** `pm`

**Mission:**
```
You are a project coordinator. When given a goal:
1. Break it into concrete tasks
2. Delegate writing to the doc-writer using <CALL_AGENT name="doc-writer">
3. Review what comes back and present a final result

Always delegate documentation — never write it yourself.
```

## Step 3 — Send a task to the coordinator

Open the chat for `pm` and send:

```
Write documentation for how Tonkatsu's real-time streaming works.
Cover: what streaming is, why it matters, and how to use it.
```

Watch what happens in the office:

**The coordinator thinks**, then produces something like:

```xml
<CALL_AGENT name="doc-writer">
Write documentation covering real-time streaming in Tonkatsu:
1. What streaming is (text arriving word by word vs. all at once)
2. Why it matters (faster perceived response, live feedback)
3. How it works (Socket.IO agent:stream events)
Include a short code example showing how to listen for stream events.
</CALL_AGENT>
```

**The server intercepts this tag** and:
1. Sends the task to `doc-writer`
2. `doc-writer` starts running — you see it working in its room
3. When `doc-writer` finishes, its result flows back to `pm`
4. `pm` reviews and presents the final answer to you

In the UI you see both assistants active, with a "delegating" badge showing the handoff.

## What you observe in real time

```
pm          → Running (thinking about the task)
pm          → Delegating to doc-writer...
doc-writer  → Running (writing the documentation)
doc-writer  → Idle (done)
pm          → Running (reviewing and wrapping up)
pm          → Idle (task complete)
```

## Adding a third assistant

You can extend the chain. Add a `reviewer`:

**Mission:**
```
You are a senior technical reviewer. When given documentation to review:
- Check for accuracy and completeness
- Flag anything missing or unclear
- Give specific, actionable feedback (not general "be clearer" notes)
Return a bullet list of findings.
```

Update `pm`'s mission to pass the writer's output to the reviewer before presenting the final result. Now the pipeline is:

```
pm → doc-writer → reviewer → pm → you
```

## Saving the team as a template

Once you're happy with the team, click **Save as Template** in the top-right controls.

This saves a blueprint of all three assistants. Next time you need this team, click the template and it recreates everyone instantly — ready to work.
