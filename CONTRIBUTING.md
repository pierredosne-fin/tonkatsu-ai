# Contributing to Tonkatsu

Thank you for your interest in contributing! This guide will get you from zero to a working development environment and walk you through the conventions we follow.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Local setup](#local-setup)
3. [Dev workflow](#dev-workflow)
4. [Code conventions](#code-conventions)
5. [Commit style](#commit-style)
6. [Pull request process](#pull-request-process)
7. [Architecture overview](#architecture-overview)
8. [How to add a new agent feature](#how-to-add-a-new-agent-feature)

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Node.js | 20+ |
| npm | 10+ (bundled with Node 20) |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

Optional but recommended:

- Docker (for testing the containerised build)
- `gh` CLI (for creating PRs from the terminal)

---

## Local setup

```bash
# 1. Fork, then clone your fork
git clone git@github.com:<your-username>/tonkatsu-ai.git
cd tonkatsu-ai

# 2. Install all workspace dependencies
npm install

# 3. Create the server environment file
cat > server/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001   # optional, defaults to 3001
EOF
```

`server/.env` is gitignored — never commit it.

---

## Dev workflow

```bash
# Start client (Vite, port 5173) + server (tsx watch, port 3001)
npm run dev

# Start client + server + docs (Docusaurus, port 3000)
npm run dev:all

# Build everything (type-check included)
npm run build

# Server only with auto-reload
npm run dev -w server

# Client only
npm run dev -w client

# Lint client
npm run lint -w client
```

| Service | URL |
|---------|-----|
| App + API | http://localhost:5173 |
| Docs (local) | http://localhost:3000 (`npm run dev:all`) |

> There is no test suite yet — CI runs lint, type-check, and build on every PR.

---

## Code conventions

### TypeScript

- **Strict mode is on** — `tsconfig.json` sets `"strict": true`.
- **No `any`** — use `unknown` and narrow with type guards, or introduce a proper interface.
- All server source lives under `server/src/`. The compiled output goes to `server/dist/` (gitignored).

### Express routers

Every router is a factory function that accepts the Socket.IO server instance:

```typescript
// server/src/routes/myFeature.ts
import { Router } from 'express';
import { Server } from 'socket.io';

export function createMyFeatureRouter(io: Server): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    // ...
    res.json({ ok: true });
  });

  return router;
}
```

Register the router in `server/src/index.ts` alongside the existing ones.

### Zustand stores (client)

Client state lives in Zustand stores under `client/src/stores/`. Keep one store per domain (agents, templates, UI state, etc.). Avoid putting server-derived state in component-local `useState` — put it in the store so any component can subscribe.

### Socket.IO events

Server-to-client events are emitted from services, not from route handlers. Route handlers call a service; the service emits the socket event. This keeps HTTP and WebSocket concerns separate.

Event names follow `snake_case` (e.g. `agent_updated`, `task_started`).

### File naming

| Location | Convention |
|----------|-----------|
| `server/src/` | `camelCase.ts` |
| `client/src/components/` | `PascalCase.tsx` |
| `client/src/stores/` | `camelCase.ts` |
| `client/src/hooks/` | `useCamelCase.ts` |

---

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/). This is enforced by `commitlint` and drives automatic versioning via `semantic-release`.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|------|------------|
| `feat` | A new feature visible to users or API consumers |
| `fix` | A bug fix |
| `chore` | Tooling, deps, CI — no production code change |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Formatting, whitespace — no logic change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `revert` | Reverts a previous commit |

### Examples

```bash
feat: add cron scheduling for agents
fix: prevent duplicate socket events on reconnect
chore: upgrade vite to 6.x
docs: add CONTRIBUTING.md and GitHub issue templates
feat(templates)!: rename `mission` field to `description`
```

A `!` after the type/scope marks a **breaking change** and triggers a major version bump.

---

## Pull request process

1. **Branch from `main`**

   ```bash
   git checkout main && git pull
   git checkout -b feat/my-feature
   ```

2. **Make your changes**, following the conventions above.

3. **Ensure CI will pass locally** before pushing:

   ```bash
   npm run lint -w client
   npm run build
   ```

4. **Push and open a PR against `main`**

   ```bash
   git push -u origin feat/my-feature
   gh pr create --base main
   ```

5. **CI checks** (`pr-checks.yml`) run automatically: lint, type-check, build. All three must pass before merge.

6. **Review** — a maintainer will review and may request changes. Address feedback with new commits (do not force-push to a PR branch under review).

7. **Merge** — maintainers squash-merge or rebase-merge. Delete your branch after merge.

### PR checklist

- [ ] Branch is up to date with `main`
- [ ] Commit messages follow Conventional Commits
- [ ] No TypeScript errors (`npm run build`)
- [ ] No lint errors (`npm run lint -w client`)
- [ ] New routes follow the `createXRouter(io)` factory pattern
- [ ] No `any` types introduced

---

## Architecture overview

### Agent lifecycle

```
POST /api/agents          → agentService.createAgent()
                               → persists to workspaces/<teamId>/agents.json
                               → emits agent_created via Socket.IO

POST /api/agents/:id/run  → claudeService.runAgent()
                               → streams tokens via agent_token events
                               → handles delegation (up to 5 levels)
                               → emits agent_updated on completion
```

### Key services (`server/src/services/`)

| Service | Responsibility |
|---------|---------------|
| `agentService.ts` | Agent CRUD, in-memory state, JSON persistence |
| `claudeService.ts` | Claude SDK execution, token streaming, delegation |
| `persistenceService.ts` | Disk I/O for agents, schedules, and templates |
| `roomService.ts` | 5×3 office grid — room assignment and availability |

### Socket.IO events

Events are namespaced as `<noun>_<verb>` (past tense for server-to-client):

| Event | Direction | Payload |
|-------|-----------|---------|
| `agent_created` | S → C | Full agent object |
| `agent_updated` | S → C | Partial agent diff |
| `agent_token` | S → C | `{ agentId, token }` |
| `task_started` | S → C | `{ agentId, taskId }` |
| `task_completed` | S → C | `{ agentId, taskId, result }` |

### Workspace files

Each agent has a workspace directory at `workspaces/<teamId>/<agentSlug>/`. Agents can read and write arbitrary files here. The directory is mounted as the working directory when the agent runs shell commands inside Docker.

`workspaces/<teamId>/agents.json` is the persistence file for the whole team — it is rewritten on every mutation.

---

## How to add a new agent feature

Use this checklist when adding a feature that touches the full stack (e.g. "agents can export a report"):

1. **Server route** — add `createExportRouter(io)` in `server/src/routes/export.ts` and register it in `server/src/index.ts`.

2. **Service** — add business logic in `server/src/services/exportService.ts`. Keep the route handler thin; it should only validate input and delegate to the service.

3. **Socket emit** — emit a typed event from the service after the operation completes:
   ```typescript
   io.to(teamId).emit('export_ready', { agentId, url });
   ```

4. **Client store** — add a Zustand action in the relevant store (e.g. `client/src/stores/agentStore.ts`) that listens for the new event and updates state:
   ```typescript
   socket.on('export_ready', ({ agentId, url }) => {
     set(state => ({ exports: { ...state.exports, [agentId]: url } }));
   });
   ```

5. **Component** — consume the store value in a React component. Prefer reading from the store over passing props through multiple layers.

6. **Types** — add shared types to `server/src/types.ts` (imported by the client via the API response shape or a shared types package if one exists).

---

## Questions?

Open a [GitHub Discussion](https://github.com/pierredosne-fin/tonkatsu-ai/discussions) for questions, ideas, or general feedback. Reserve GitHub Issues for confirmed bugs and concrete feature requests.
