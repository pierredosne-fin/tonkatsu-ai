# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
# Dev (client + server)
npm run dev

# Dev (client + server + docs)
npm run dev:all

# Build all
npm run build

# Server only (auto-reload)
npm run dev -w server

# Client only
npm run dev -w client

# Lint client
npm run lint -w client
```

No test suite is configured — `npm test` is not available.

## Environment

`server/.env` (not committed):

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001   # optional, defaults to 3001
```

## Key conventions

- **Monorepo**: npm workspaces — `client/` (React 19 + Vite) and `server/` (Express + Socket.IO, ESM TypeScript).
- **Server entry**: `server/src/index.ts`, compiled to `server/dist/` via `tsc`.
- **Client entry**: `client/src/main.tsx`, built to `client/dist/` via Vite.
- **Agent state** is kept in an in-memory `Map` and persisted to `workspaces/<teamId>/agents.json` on every mutation.
- **No `any`**: the server codebase uses strict TypeScript — keep it that way.
- **Routing**: every Express router is a factory `createXRouter(io: Server): Router`. Follow this pattern for new routes.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) — required for semantic-release to generate the changelog correctly.

## Architecture overview

See `README.md` for the full architecture description, API reference, and Socket.IO event list.
