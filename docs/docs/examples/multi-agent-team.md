---
id: multi-agent-team
title: Multi-Agent Team
sidebar_position: 2
---

# Multi-Agent Team

This example sets up a two-agent team where a **project manager** orchestrates research and writing, delegating to a **documentation writer**. You'll see real-time delegation in the UI and learn how to package the team as a reusable template.

## The setup

| Agent | Name | Role |
|-------|------|------|
| Orchestrator | `pm` | Breaks down goals, delegates, synthesizes results |
| Specialist | `doc-writer` | Writes structured technical documentation |

## 1. Create the `doc-writer` agent

Click **+ New Agent** and fill in:

**Name:** `doc-writer`

**Mission:**
```
You are a technical documentation writer. When given a topic and source material,
you produce clear, accurate, developer-oriented documentation. Your output is
always in markdown with:
- A brief intro paragraph
- Structured sections with headers
- Code examples where relevant
- A "Key takeaways" section at the end

Be concise. Developers scan, not read.
```

## 2. Create the `pm` agent

Click **+ New Agent** again:

**Name:** `pm`

**Mission:**
```
You are a project manager and technical lead. When given a goal:
1. Break it into concrete subtasks
2. Delegate writing tasks to the doc-writer agent using <CALL_AGENT name="doc-writer">
3. Review the output and synthesize a final result

Always delegate documentation work — do not write docs yourself.
Use <CALL_AGENT name="doc-writer">...</CALL_AGENT> to hand off tasks.
```

## 3. Trigger a delegation

Open the ChatModal for `pm` and send:

```
Create developer documentation for Tonkatsu's Socket.IO API.
Cover: how to connect, the agent:sendMessage event, and real-time streaming.
```

Watch what happens in the UI:

**Step 1 — PM thinks:**
```
The pm agent analyzes the task and decides to delegate the writing.
```

**Step 2 — PM delegates:**

The PM's output contains:
```xml
<CALL_AGENT name="doc-writer">
Write developer documentation for the Tonkatsu Socket.IO API covering:

1. How to connect to the Socket.IO server
2. The agent:sendMessage client→server event (payload shape, when to use it)
3. Real-time streaming via agent:stream (how chunks accumulate, example code)

Format as markdown with code examples. Target audience: JavaScript developers.
</CALL_AGENT>
```

**Step 3 — Server dispatches:**

The server intercepts the `<CALL_AGENT>` tag and:
1. Looks up the agent named `doc-writer`
2. Emits `agent:delegating { fromId: pm.id, toName: "doc-writer", prompt: "..." }`
3. Calls `claudeService.runTask(doc-writer.id, prompt, depth=1)`

**Step 4 — You see in the UI:**

```
pm        [running] → delegating to doc-writer...
doc-writer [running] ← receiving task from pm
doc-writer [running] ... streaming documentation ...
doc-writer [idle]   ← complete
pm        [running] ← receiving doc-writer's result
pm        [idle]    ← synthesizing and presenting final answer
```

**Step 5 — PM presents the result:**

The PM receives `doc-writer`'s markdown output, reviews it, and presents a final summary to you.

## 4. Delegation event flow

```
pm receives user message
       │
       ▼
claudeService.runTask(pm.id, message, depth=0)
       │
       │  pm output contains <CALL_AGENT name="doc-writer">
       │
       ▼
server emits agent:delegating
       │
       ▼
claudeService.runTask(doc-writer.id, inner_prompt, depth=1)
       │  doc-writer streams its response
       │
       ▼
server emits agent:delegationComplete
       │
       ▼
doc-writer output injected into pm's session context
       │
       ▼
pm continues, references doc-writer's work in final response
```

## 5. Delegation limits

Delegation depth is capped at **5** to prevent infinite loops. An agent at depth 5 that tries to delegate further will have its `<CALL_AGENT>` tag returned as a literal string with an error message injected, rather than triggering a recursive call.

Example deep chain (allowed):
```
pm (depth 0)
  → analyst (depth 1)
    → data-fetcher (depth 2)
      → validator (depth 3)
        → formatter (depth 4)  ← last allowed delegation
```

## 6. Adding a third agent

Extend the team with a `reviewer` agent:

**Mission:**
```
You are a senior technical reviewer. When given documentation to review:
1. Check for accuracy and completeness
2. Flag any missing edge cases
3. Suggest concrete improvements (not general "be clearer" feedback)
Return your review as a structured list of findings.
```

Update `pm`'s mission to include:

```
After doc-writer produces documentation, pass it to the reviewer:
<CALL_AGENT name="reviewer">
Review this documentation and flag any issues:
[doc-writer's output]
</CALL_AGENT>
```

Now the PM orchestrates a two-step pipeline: write → review → synthesize.

## 7. Save as a team template

Once you're happy with the team, click **Save as Template** in the HUD.

This creates a team template in `workspaces/templates.json` with references to snapshots of all three agents.

To reinstantiate the team later:

```bash
curl -X POST http://localhost:3001/api/templates/teams/<templateId>/instantiate \
  -H "Content-Type: application/json" \
  -d '{ "teamId": "docs-squad-v2" }'
```

This creates fresh agent instances with the same missions and settings — ready to work immediately.
