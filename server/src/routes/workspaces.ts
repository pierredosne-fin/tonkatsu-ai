import { Router } from 'express';
import { readdirSync, existsSync, statSync } from 'fs';
import { join, basename, isAbsolute } from 'path';
import os from 'os';

export interface WorkspaceResult {
  path: string;
  name: string;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cache', '__pycache__', '.next', 'dist',
  'build', '.venv', 'venv', '.tox', 'vendor', 'target', '.idea',
  '.vscode', 'coverage', '.nyc_output',
]);

function scanForClaude(
  dir: string,
  maxDepth: number,
  currentDepth = 0
): WorkspaceResult[] {
  if (currentDepth > maxDepth) return [];

  const results: WorkspaceResult[] = [];

  try {
    if (existsSync(join(dir, 'CLAUDE.md'))) {
      results.push({ path: dir, name: basename(dir) });
      // Don't recurse further — subdirs are project internals
      return results;
    }
  } catch {
    return results;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const child = join(dir, entry.name);
      try {
        statSync(child); // check accessible
        results.push(...scanForClaude(child, maxDepth, currentDepth + 1));
      } catch {
        // permission denied — skip
      }
    }
  } catch {
    // unreadable dir — skip
  }

  return results;
}

export function createWorkspacesRouter() {
  const router = Router();

  router.get('/scan', (req, res) => {
    const scanPath = req.query.path as string | undefined;

    if (scanPath) {
      if (!isAbsolute(scanPath)) {
        res.status(400).json({ error: 'path must be absolute' });
        return;
      }
      if (!existsSync(scanPath)) {
        res.status(404).json({ error: 'Directory not found' });
        return;
      }
      res.json(scanForClaude(scanPath, 4));
      return;
    }

    // Default: scan common dev directories under home
    const home = os.homedir();
    const candidates = ['dev', 'projects', 'code', 'work', 'src', 'repos']
      .map((d) => join(home, d))
      .filter((d) => existsSync(d));

    // Fall back to scanning home itself at shallow depth
    if (candidates.length === 0) candidates.push(home);

    const results = candidates.flatMap((d) => scanForClaude(d, 3));
    // Deduplicate by path
    const seen = new Set<string>();
    res.json(results.filter((r) => {
      if (seen.has(r.path)) return false;
      seen.add(r.path);
      return true;
    }));
  });

  return router;
}
