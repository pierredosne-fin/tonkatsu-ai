# Tonkatsu

A virtual office platform where multiple Claude Code AI agents run autonomously in named rooms, collaborate in real time, and delegate tasks to each other.

## Features

- Multi-agent workspace with a 5×3 room grid per team
- Real-time collaboration via Socket.IO
- Inter-agent task delegation with recursive call depth control
- Repo-backed agents using git worktrees
- Session persistence across server restarts
- Agent and team templates with one-click instantiation
- Semantic versioning + automated Docker image releases

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express + Socket.IO, ESM TypeScript (`tsx watch`) |
| Frontend | React 19 + Vite, Zustand |
| AI | `@anthropic-ai/claude-agent-sdk`, `claude-sonnet-4-6` |
| Container | Docker (multi-stage), GitHub Container Registry |
| CI/CD | GitHub Actions — PR checks, develop builds, semantic release |

## Getting started

### Prerequisites

- Node.js 20+
- An Anthropic API key

### Install

```bash
npm install
```

### Configure

Create `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001          # optional, defaults to 3001
```

### Run

```bash
# Client + server (recommended)
npm run dev

# Server only (auto-reloads on src/ changes)
npm run dev -w server

# Client only
npm run dev -w client

# Client + server + docs
npm run dev:all
```

The server listens on `http://localhost:3001` and the client on `http://localhost:5173` (Vite default).

## Building

```bash
npm run build
```

Outputs:
- `client/dist/` — static Vite bundle
- `server/dist/` — compiled TypeScript

## Docker

```bash
docker build -t tonkatsu .
docker run -e ANTHROPIC_API_KEY=sk-ant-... -p 3001:3001 tonkatsu
```

The multi-stage Dockerfile produces a lean production image using only server production dependencies.

## Project structure

```
.
├── client/          # React 19 + Vite frontend
├── server/          # Express + Socket.IO backend
│   └── src/
│       └── services/
│           ├── agentService.ts      # Agent lifecycle & persistence
│           ├── claudeService.ts     # Claude SDK execution
│           ├── persistenceService.ts
│           └── roomService.ts
├── workspaces/      # Agent workspaces on disk (gitignored)
├── repos/           # Bare git clones for repo-backed agents (gitignored)
├── docs/            # Docusaurus documentation site
├── Dockerfile
└── CLAUDE.md
```

## CI/CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `pr-checks.yml` | PR → `main` or `develop` | Lint, type-check, build |
| `develop.yml` | Push → `develop` | Lint, type-check, build, Docker push |
| `release.yml` | Push → `main` | Lint, build → semantic-release → Docker push to GHCR |

Docker images are published to `ghcr.io/<owner>/tonkatsu` and tagged `vX.Y.Z` + `latest`.

## Docs site

```bash
npm run docs:dev
```

Built with Docusaurus, available at `http://localhost:3000`.

## License

Private.
