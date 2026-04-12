import { Router } from 'express';
import { execSync } from 'child_process';
import { saveSshKey, deleteSshKey, getSshKeyPath, hasGlobalSshKey, GLOBAL_SSH_KEY_NAME } from '../services/persistenceService.js';
import { unlinkSync } from 'fs';

export function createSshKeysRouter() {
  const router = Router();

  // Returns whether the global key is configured
  router.get('/', (_req, res) => {
    res.json({ configured: hasGlobalSshKey() });
  });

  // Save global SSH key (content only, always stored as 'default')
  router.post('/', (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'content required' });
      return;
    }

    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd() + '\n';
    saveSshKey(GLOBAL_SSH_KEY_NAME, normalized);

    const keyPath = getSshKeyPath(GLOBAL_SSH_KEY_NAME);
    try {
      execSync(`ssh-keygen -l -f "${keyPath}"`, { stdio: 'pipe' });
    } catch {
      try { unlinkSync(keyPath); } catch { /* ignore */ }
      res.status(400).json({
        error: 'Invalid SSH private key format. Paste the complete key including -----BEGIN ... PRIVATE KEY----- header and footer.',
      });
      return;
    }

    res.status(201).json({ ok: true });
  });

  // Delete the global key
  router.delete('/', (_req, res) => {
    deleteSshKey(GLOBAL_SSH_KEY_NAME);
    res.status(204).send();
  });

  return router;
}
