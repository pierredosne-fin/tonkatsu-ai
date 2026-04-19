---
id: intro
title: Introduction
sidebar_position: 1
---

<div style={{textAlign: 'center', margin: '2rem 0 2.5rem'}}>
  <img src="/img/tonkatsu.png" alt="Tonkatsu" style={{height: '140px', borderRadius: '0.75rem'}} />
  <h1 style={{fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginTop: '1rem', marginBottom: '0.25rem'}}>Tonkatsu</h1>
  <p style={{fontSize: '1.1rem', opacity: 0.6, marginBottom: 0}}>A virtual office for AI assistants</p>
</div>

**Tonkatsu** is a platform where multiple AI assistants work for you simultaneously — each with a specific role, running in the background, collaborating with each other, and asking for your input only when they need a decision.

## What does it actually do?

Imagine a real office floor, but instead of people, it's AI assistants:

- Each assistant has a **name**, a **role**, and a **room** on a visual grid
- You can see at a glance who is working, who is waiting for you, and who is idle
- You chat with any assistant by clicking on its room
- Assistants can **pass work to each other** — a coordinator can ask a specialist to handle a subtask, then use that result to complete the bigger job
- Everything happens in real time, streaming directly to your browser

## A typical workflow

1. You create an assistant and give it a role: *"You are a data analyst. When given a spreadsheet, you summarize the key trends."*
2. You send it a message: *"Analyze this month's sales data."*
3. The assistant gets to work — reading files, writing summaries, running calculations
4. If it needs a decision from you, it pauses and asks
5. When it's done, it goes back to idle — ready for the next task

No setup per task. No copy-pasting into ChatGPT. The assistant just works.

## What makes it different

| | Tonkatsu | Typical AI chat |
|--|---------|----------------|
| Multiple assistants at once | ✅ | ❌ |
| Assistants collaborate | ✅ | ❌ |
| Works in the background | ✅ | ❌ |
| Remembers past conversations | ✅ | Sometimes |
| Can read and write real files | ✅ | ❌ |
| Visual overview of all activity | ✅ | ❌ |
| Scheduled / automated tasks | ✅ | ❌ |
| Self-hosted (your data stays yours) | ✅ | ❌ |

## Key features

- **Visual office grid** — see all your assistants at a glance. Who's running, idle, waiting for you.
- **Real-time streaming** — watch assistants work word by word as they think and respond.
- **Delegation** — assistants hand tasks to each other automatically. You only talk to the coordinator.
- **Persistent memory** — assistants remember what they've learned across sessions. Conversations survive restarts.
- **Codebase access** — link an assistant to a Git repository and it can read, edit, and commit code.
- **Scheduled tasks** — run assistants on a schedule: daily reports, monitoring, data syncs.
- **Templates** — save a team configuration and recreate it instantly.
- **Self-hosted** — your API key and data never leave your server.

## Built on

Tonkatsu uses [Anthropic Claude](https://anthropic.com) (the same AI behind Claude.ai) to power every assistant. It's open-source and runs entirely on your own machine or server.
