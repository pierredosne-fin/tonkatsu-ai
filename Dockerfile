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
FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

# Base tools + GitHub CLI + Google Cloud SDK (includes gcloud and bq)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git openssh-client curl ca-certificates gnupg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
         | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
         > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y --no-install-recommends \
         gh google-cloud-cli \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/.ssh \
    && ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null \
    && chmod 700 /root/.ssh

# Only install server production deps
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev && npm cache clean --force

# Copy compiled server and built client static files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 5173

CMD ["node", "server/dist/index.js"]
