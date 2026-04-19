---
id: getting-started
title: Getting Started
sidebar_position: 2
---

# Getting Started

This guide walks you through installing Tonkatsu, creating your first AI assistant, and understanding how your data is stored.

## What you need before starting

- **An Anthropic API key** — this is what lets assistants think. Get one at [console.anthropic.com](https://console.anthropic.com/)
- **Docker** *(recommended)* — zero-dependency install. Or use Node.js 18+ if you prefer running from source.
- **Git** — only needed if you want assistants that work inside a code repository

## Step 1 — Install

### Option A — Docker (recommended)

No Node.js required on the host. The image bundles everything.

```bash
git clone https://github.com/pierredosne-fin/data-platform-tonkatsu.git
cd data-platform-tonkatsu

# Build the image
docker build -t tonkatsu .
```

### Option B — Node.js

```bash
git clone https://github.com/pierredosne-fin/data-platform-tonkatsu.git
cd data-platform-tonkatsu
npm install
```

## Step 2 — Add your API key

Create a file called `server/.env` and paste in your Anthropic API key:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001  # optional, defaults to 3001
```

This file is never shared or committed to version control. The API key stays on your machine.

## Step 3 — Start the app

### Option A — Docker

```bash
docker run -d \
  --name tonkatsu \
  -p 3001:3001 \
  -v $(pwd)/workspaces:/app/workspaces \
  -v $(pwd)/repos:/app/repos \
  --env-file server/.env \
  tonkatsu
```

The UI is served by the same container at [http://localhost:3001](http://localhost:3001).

### Option B — Node.js (dev mode)

```bash
npm run dev
```

This starts two things at once:

| What | Address | Description |
|------|---------|-------------|
| The office UI | http://localhost:5173 | The browser interface you'll use every day |
| The server | http://localhost:3001 | Handles AI, data, and real-time updates |

Open [http://localhost:5173](http://localhost:5173) in your browser (or [http://localhost:3001](http://localhost:3001) if using Docker). You'll see an empty grid — your office, ready for assistants.

## Step 4 — Create your first assistant

1. Click **+ New Agent** in the top-right corner
2. Fill in:
   - **Name** — a short identifier, e.g. `assistant`
   - **Mission** — describe what this assistant does, in plain language. For example: *"You are a helpful assistant. Answer questions clearly and concisely."*
   - **Avatar color** — pick any color you like
3. Click **Create**

The assistant appears in a room on the grid.

## Step 5 — Chat with it

Click on the assistant's room to open the chat. Type a message and press **Enter**.

The assistant starts working immediately. You'll see its response streaming in word by word. If it uses any tools (like reading a file or running a command), those appear inline too.

## Read-only mode

Want to let someone observe the office without being able to change anything? Enable read-only mode:

```env
# server/.env
READ_ONLY=true
```

In read-only mode:
- Anyone can view assistants and watch them work
- No one can create, delete, or modify assistants
- No one can move assistants or start new conversations

This is useful for **demos**, **shared screens**, or **team visibility dashboards**.

## Where your data lives

Every assistant has a private folder on disk. Nothing is stored in a database — it's all plain files you can open and read.

```
workspaces/
  my-team/
    agents.json          ← list of all assistants and their current state
    assistant/           ← one folder per assistant
      SOUL.md            ← who the assistant is (name, mission, personality)
      USER.md            ← context about you (your role, preferences)
      OPS.md             ← how it should approach work
      MEMORY.md          ← index of things it has learned over time
      TOOLS.md           ← what tools and integrations it has access to
      memory/            ← its long-term notes and logs
      .claude/
        settings.json    ← which tools it's allowed to use
```

You can open and edit any of these files directly. Changes take effect on the next task.

## Next steps

- [Your first agent →](./examples/first-agent) — a step-by-step walkthrough with a real example
- [Multi-agent teams →](./examples/multi-agent-team) — set up assistants that work together
- [Scheduled tasks →](./examples/scheduled-tasks) — automate recurring jobs
- [Deployment →](./deployment) — run Tonkatsu on a server for your whole team
