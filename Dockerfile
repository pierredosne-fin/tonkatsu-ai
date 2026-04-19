# ──────────────────────────────────────────────
# Stage 1: Builder — install deps & compile
# ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

# Copy source
COPY client/ ./client/
COPY server/ ./server/

# Build client (Vite → client/dist/) and server (tsc → server/dist/)
RUN npm run build -w client && npm run build -w server

# ──────────────────────────────────────────────
# Stage 2: Runtime — production image
# ──────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install serve for static frontend + server production deps
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev && \
    npm install -g serve && \
    npm cache clean --force

# Copy compiled server and built client static files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# 5173 = React frontend (serve), 3001 = Express API + Socket.IO
EXPOSE 5173 3001

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
