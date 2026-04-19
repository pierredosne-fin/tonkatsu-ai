---
id: deployment
title: Deployment
sidebar_position: 8
---

# Deployment

Running Tonkatsu in production requires building both packages, configuring the server environment, and optionally setting up a reverse proxy and process manager.

## Build

```bash
npm run build
```

Outputs:
- `client/dist/` — static frontend assets
- `server/dist/` — compiled ESM JavaScript

## Environment variables

Create `server/.env` on the production machine:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
NODE_ENV=production
READ_ONLY=false   # set to true to disable write operations (see Scaling below)
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key. Never sent to the browser. |
| `PORT` | No | Server port. Defaults to `3001`. |
| `NODE_ENV` | No | Set to `production` to suppress dev warnings. |
| `READ_ONLY` | No | `true` or `1` — disables all write operations. See [Scaling](#scaling). |

Never commit `.env`. Use a secrets manager (AWS Secrets Manager, Vault, 1Password Secrets Automation) for team deployments.

## Running the server

```bash
# Production start
node server/dist/index.js
```

The server serves the API, Socket.IO, and (optionally) the static client assets from `client/dist/`.

To serve the frontend from Express directly, add a static middleware in `server/src/index.ts`:

```ts
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}
```

Or serve `client/dist/` from a CDN or static host (Vercel, Cloudflare Pages) and point `VITE_API_URL` at your server.

---

## Running with PM2

[PM2](https://pm2.keymetrics.io/) keeps the server alive and restarts it on crash.

```bash
npm install -g pm2

# Start
pm2 start server/dist/index.js --name tonkatsu

# Auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs tonkatsu

# Restart
pm2 restart tonkatsu
```

**PM2 ecosystem file** (`ecosystem.config.cjs`):

```js
module.exports = {
  apps: [{
    name: 'tonkatsu',
    script: 'server/dist/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    env_file: 'server/.env',
    max_memory_restart: '1G',
    watch: false,
    instances: 1,        // must be 1 — in-memory agent map is not shared
    exec_mode: 'fork',   // not cluster mode — single instance required
  }],
};
```

Start with:

```bash
pm2 start ecosystem.config.cjs
```

:::caution Single instance only
Do not run multiple server instances. The agent state is an in-memory `Map` that is not shared between processes. Multiple instances will have diverging state.
:::

---

## Running with systemd

```ini
# /etc/systemd/system/tonkatsu.service

[Unit]
Description=Tonkatsu AI Agent Platform
After=network.target

[Service]
Type=simple
User=tonkatsu
WorkingDirectory=/opt/tonkatsu
EnvironmentFile=/opt/tonkatsu/server/.env
ExecStart=/usr/bin/node /opt/tonkatsu/server/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable tonkatsu
sudo systemctl start tonkatsu
sudo journalctl -u tonkatsu -f   # follow logs
```

---

## Reverse proxy with nginx

Put nginx in front for TLS termination, authentication, and to forward WebSocket upgrade headers.

```nginx
# /etc/nginx/sites-available/tonkatsu

server {
    listen 443 ssl http2;
    server_name tonkatsu.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/tonkatsu.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tonkatsu.yourdomain.com/privkey.pem;

    # Optional: basic auth
    # auth_basic "Tonkatsu";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;

        # Required for Socket.IO WebSocket upgrade
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeouts for long-running agent streams
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

server {
    listen 80;
    server_name tonkatsu.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Get a TLS certificate with Let's Encrypt:

```bash
certbot --nginx -d tonkatsu.yourdomain.com
```

:::important WebSocket headers
The `Upgrade` and `Connection` headers are required for Socket.IO to establish a WebSocket connection. Without them, Socket.IO falls back to long-polling, which works but is less efficient and may cause issues with streaming.
:::

---

## Reverse proxy with Caddy

Caddy handles TLS automatically:

```caddy
# Caddyfile

tonkatsu.yourdomain.com {
    reverse_proxy localhost:3001 {
        header_up Upgrade {http.upgrade}
        header_up Connection "upgrade"
    }
}
```

```bash
caddy run --config Caddyfile
```

---

## Persistent storage

The `workspaces/` and `repos/` directories must persist across deployments. Do not store them in ephemeral locations (e.g., a Docker container's filesystem without a volume mount).

**If using Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build

VOLUME ["/app/workspaces", "/app/repos", "/app/.sync-data"]

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
```

```bash
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/workspaces:/app/workspaces \
  -v $(pwd)/repos:/app/repos \
  -v $(pwd)/.sync-data:/app/.sync-data \
  --env-file server/.env \
  tonkatsu
```

---

## Upgrading

```bash
git pull
npm install
npm run build
pm2 restart tonkatsu  # or systemctl restart tonkatsu
```

State in `workspaces/` is preserved across upgrades — no migrations needed. If the agent data format changes between versions, check the release notes for migration instructions.

---

## Scaling {#scaling}

Tonkatsu's default single-instance model keeps things simple. For higher availability or larger teams, read-only mode enables a straightforward horizontal scaling pattern without any coordination layer.

### The scaling model

Tonkatsu uses JSON files on disk for all persistence (`workspaces/`, `repos/`). This means multiple server instances can share state by pointing at the same filesystem:

```
                    ┌─────────────────────────────────┐
                    │   Shared persistent volume       │
                    │   (NFS / AWS EFS / POSIX FS)     │
                    │                                  │
                    │   workspaces/                    │
                    │   repos/                         │
                    └──────────┬──────────────────────┘
                               │ mounted read-write
              ┌────────────────┼────────────────────┐
              │                │                    │
    ┌─────────▼──────┐  ┌──────▼─────────┐  ┌──────▼─────────┐
    │  Writer         │  │  Reader (RO)   │  │  Reader (RO)   │
    │  READ_ONLY=false│  │  READ_ONLY=true│  │  READ_ONLY=true│
    │  :3001          │  │  :3002         │  │  :3003         │
    └─────────────────┘  └────────────────┘  └────────────────┘
              │                │                    │
              └────────────────┴────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   nginx load balancer│
                    │   (upstream)         │
                    └─────────────────────┘
```

- **One writer instance** — handles all mutations: creating/deleting agents, running tasks, updating workspace files
- **Multiple read-only instances** — serve the UI and stream agent output; all write-capable REST endpoints return `403`, write socket events are no-ops
- **No coordination layer** — the shared filesystem is the single source of truth

### Shared filesystem options

Any POSIX-compatible network filesystem works:

| Option | Notes |
|--------|-------|
| AWS EFS | Managed, elastic. Good default for AWS deployments. |
| NFS | Simple, works anywhere. Watch for latency on writes. |
| GlusterFS | Distributed, no single point of failure. |
| Local path | Only valid if all instances run on the same machine (e.g. multiple ports). |

Mount the volume at the `workspaces/` and `repos/` paths on every instance:

```bash
# Example: mount EFS on each host
sudo mount -t nfs4 \
  fs-xxxxxxxx.efs.us-east-1.amazonaws.com:/ \
  /opt/tonkatsu/workspaces
```

### nginx upstream configuration

```nginx
upstream tonkatsu_readers {
    server 10.0.0.2:3001;   # read-only instance
    server 10.0.0.3:3001;   # read-only instance
    server 10.0.0.4:3001;   # read-only instance
}

upstream tonkatsu_writer {
    server 10.0.0.1:3001;   # single writer instance
}

server {
    listen 443 ssl http2;
    server_name tonkatsu.yourdomain.com;

    # Route write operations to the writer
    location ~ ^/api/(agents|templates|schedules|skills) {
        limit_except GET OPTIONS {
            proxy_pass http://tonkatsu_writer;
        }
        proxy_pass http://tonkatsu_readers;  # GETs go to readers
        include /etc/nginx/proxy_params;
    }

    # All Socket.IO traffic (streaming) goes to readers
    location /socket.io/ {
        proxy_pass http://tonkatsu_readers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        include /etc/nginx/proxy_params;
        proxy_read_timeout 300s;
    }

    # Static assets — any instance
    location / {
        proxy_pass http://tonkatsu_readers;
        include /etc/nginx/proxy_params;
    }
}
```

:::note
Socket.IO connections are stateful — a client that connects to one reader instance must stay on that instance for the duration of the connection. Enable `ip_hash` in the upstream block if sticky sessions aren't handled at the load balancer level.
:::

---

## Monitoring

Recommended metrics to watch:

| Metric | Why |
|--------|-----|
| `agent:statusChanged` event rate | Detect stuck agents |
| Node.js heap usage | Detect memory leaks from large stream buffers |
| Anthropic API error rate | Detect quota exhaustion or key expiry |
| `workspaces/` disk usage | Detect runaway memory logs |

For a lightweight setup, pipe server logs to [Loki](https://grafana.com/oss/loki/) and build a Grafana dashboard on top. Or use PM2's built-in monitoring with `pm2 monit`.
