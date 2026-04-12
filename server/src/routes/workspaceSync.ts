import { Router } from 'express';
import { z } from 'zod';
import { execSync } from 'child_process';
import type { Server } from 'socket.io';
import {
  getWorkspaceSyncConfig,
  saveWorkspaceSyncConfig,
  WORKSPACES_DIR,
  getSshKeyPath,
  GLOBAL_SSH_KEY_NAME,
  hasGlobalSshKey,
} from '../services/persistenceService.js';
import { syncWorkspaceDir } from '../services/gitService.js';
import { loadAllTemplates } from '../services/templateService.js';
import { loadAllSkills } from '../services/skillService.js';
import { reloadSchedules } from '../services/cronService.js';
import { hotReloadWorkspace } from '../services/agentService.js';

const ConfigSchema = z.object({
  remoteUrl: z.string().min(1),
  branch: z.string().min(1),
});

export function createWorkspaceSyncRouter(io: Server) {
  const router = Router();

  // GET config + whether global SSH key is configured
  router.get('/', (_req, res) => {
    res.json({ config: getWorkspaceSyncConfig(), sshKeyConfigured: hasGlobalSshKey() });
  });

  // Save config (no sync)
  router.put('/', (req, res) => {
    const result = ConfigSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: result.error.flatten() }); return; }
    const existing = getWorkspaceSyncConfig();
    saveWorkspaceSyncConfig({ ...existing, ...result.data });
    res.json({ ok: true });
  });

  // Trigger sync: git fetch + reset --hard to remote branch (drops all local changes)
  router.post('/trigger', (_req, res) => {
    const cfg = getWorkspaceSyncConfig();
    if (!cfg) {
      res.status(400).json({ error: 'No sync config configured.' });
      return;
    }

    const now = new Date().toISOString();
    const result = syncWorkspaceDir(WORKSPACES_DIR, cfg);
    saveWorkspaceSyncConfig({
      ...cfg,
      lastSyncAt: now,
      lastSyncStatus: result.ok ? 'ok' : 'error',
      lastSyncError: result.error,
    });

    if (result.ok) {
      try { loadAllTemplates(); } catch { /* ignore */ }
      try { loadAllSkills(); } catch { /* ignore */ }
      try { reloadSchedules(io); } catch { /* ignore */ }
      hotReloadWorkspace(io);
      io.emit('workspace:synced', { syncedAt: now });
      res.json({ ok: true, syncedAt: now });
    } else {
      res.status(422).json({ ok: false, error: result.error });
    }
  });

  // Test SSH connection
  router.post('/test-ssh', (_req, res) => {
    if (!hasGlobalSshKey()) {
      res.status(400).json({ ok: false, output: 'No SSH key configured.' });
      return;
    }
    const cfg = getWorkspaceSyncConfig();
    const keyPath = getSshKeyPath(GLOBAL_SSH_KEY_NAME);
    const host = cfg?.remoteUrl?.match(/^git@([^:]+):/)?.[1] ?? 'github.com';
    const sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o BatchMode=yes -T git@${host}`;
    try {
      const stdout = execSync(sshCmd, { stdio: 'pipe', timeout: 10000 }).toString();
      res.json({ ok: true, output: stdout || `Connected to ${host}` });
    } catch (err: unknown) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
      const authenticated = /successfully authenticated|Welcome to GitLab/i.test(stderr);
      res.json({ ok: authenticated, output: stderr.trim() });
    }
  });

  return router;
}
