import { execSync } from 'child_process';
import { existsSync, readdirSync, mkdirSync, rmSync, symlinkSync, lstatSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { GitSync } from '../models/types.js';
import { getSshKeyPath, GLOBAL_SSH_KEY_NAME, hasGlobalSshKey, REPOS_DIR, type WorkspaceSyncConfig } from './persistenceService.js';

export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export function createWorktree(repoPath: string, worktreePath: string, branch: string): boolean {
  try {
    // Remove stale directory if it exists but isn't a registered worktree —
    // git worktree add will fail on a non-empty target path.
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });

    // Exclude runtime config files from git tracking in this worktree.
    // Uses per-worktree config.worktree + core.excludesFile (requires extensions.worktreeConfig).
    try {
      const gitFileContent = readFileSync(join(worktreePath, '.git'), 'utf8').trim();
      const gitdirMatch = gitFileContent.match(/^gitdir:\s*(.+)$/);
      if (gitdirMatch) {
        const worktreeGitDir = gitdirMatch[1].trim();
        const infoDir = join(worktreeGitDir, 'info');
        mkdirSync(infoDir, { recursive: true });
        // Patterns for untracked runtime files the server writes.
        // .claude/ can't exclude as a directory (tracked files exist inside it), but
        // .claude/** matches individual untracked files at any depth under .claude/.
        const excludePatterns = [
          '.mcp.json',
          '.claude/**',
          'SOUL.md',
          'USER.md',
          'OPS.md',
          'MEMORY.md',
          'TOOLS.md',
          'memory/',
        ].join('\n') + '\n';
        const excludeFile = join(infoDir, 'exclude');
        writeFileSync(excludeFile, excludePatterns, 'utf8');
        // Enable per-worktree config on the repo (idempotent)
        execSync('git config extensions.worktreeConfig true', { cwd: repoPath, stdio: 'pipe' });
        // Point this worktree's core.excludesFile at our patterns file
        const configWorktreePath = join(worktreeGitDir, 'config.worktree');
        writeFileSync(configWorktreePath, `[core]\n\texcludesFile = ${excludeFile}\n`, 'utf8');
        // skip-worktree on all tracked .claude/ files so local modifications are invisible to git
        try {
          const trackedFiles = execSync('git ls-files .claude/', { cwd: worktreePath, stdio: 'pipe' })
            .toString().trim();
          if (trackedFiles) {
            const files = trackedFiles.split('\n').map(f => `"${f}"`).join(' ');
            execSync(`git update-index --skip-worktree ${files}`, { cwd: worktreePath, stdio: 'pipe' });
          }
        } catch { /* no tracked .claude/ files — safe to ignore */ }
      }
    } catch (excludeErr) {
      console.warn('[git] Failed to write worktree exclude:', excludeErr);
    }

    return true;
  } catch (err) {
    console.warn('[git] Failed to create worktree:', err);
    return false;
  }
}

export function pruneWorktrees(repoPath: string): void {
  try {
    execSync('git worktree prune', { cwd: repoPath, stdio: 'pipe' });
  } catch { /* ignore */ }
}

export function removeWorktree(repoPath: string, worktreePath: string): void {
  try {
    execSync(`git worktree remove --force "${worktreePath}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch (err) {
    console.warn('[git] Failed to remove worktree:', err);
  }
}

/**
 * Workspace sync via symlink:
 * - Clones the remote repo into repos/<slug>/ (idempotent)
 * - Replaces workspaces/ with a symlink → repos/<slug>/
 * - Subsequent calls just do git pull in the cloned repo
 */
export function syncWorkspaceDir(workspacesDir: string, cfg: WorkspaceSyncConfig): { ok: boolean; error?: string } {
  try {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (hasGlobalSshKey()) {
      const keyPath = getSshKeyPath(GLOBAL_SSH_KEY_NAME);
      env['GIT_SSH_COMMAND'] = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o BatchMode=yes`;
    }

    const slug = repoSlugFromUrl(cfg.remoteUrl);
    const clonedPath = join(REPOS_DIR, slug);

    if (existsSync(clonedPath) && isGitRepo(clonedPath)) {
      // Already cloned — mirror remote exactly (fetch + hard reset + clean untracked)
      const branch = cfg.branch ?? 'main';
      execSync(`git fetch origin`, { cwd: clonedPath, env, stdio: 'pipe' });
      execSync(`git reset --hard origin/${branch}`, { cwd: clonedPath, env, stdio: 'pipe' });
      execSync(`git clean -fd`, { cwd: clonedPath, env, stdio: 'pipe' });
    } else {
      // First time: clone into repos/<slug>/
      mkdirSync(dirname(clonedPath), { recursive: true });
      const branchFlag = cfg.branch ? `--branch "${cfg.branch}" ` : '';
      execSync(`git clone ${branchFlag}"${cfg.remoteUrl}" "${clonedPath}"`, { env, stdio: 'pipe' });
    }

    // If workspaces/ is already a git repo (not a symlink), mirror remote exactly
    const isSymlink = existsSync(workspacesDir) && lstatSync(workspacesDir).isSymbolicLink();
    if (!isSymlink && existsSync(workspacesDir) && isGitRepo(workspacesDir)) {
      const branch = cfg.branch ?? 'main';
      execSync(`git fetch origin`, { cwd: workspacesDir, env, stdio: 'pipe' });
      execSync(`git reset --hard origin/${branch}`, { cwd: workspacesDir, env, stdio: 'pipe' });
      execSync(`git clean -fd`, { cwd: workspacesDir, env, stdio: 'pipe' });
      return { ok: true };
    }

    // Create/update symlink: workspaces/ → repos/<slug>/
    if (!isSymlink) {
      if (existsSync(workspacesDir)) {
        rmSync(workspacesDir, { recursive: true, force: true });
      }
      symlinkSync(clonedPath, workspacesDir);
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[git] syncWorkspaceDir failed:', msg);
    return { ok: false, error: msg };
  }
}

export function repoSlugFromUrl(url: string): string {
  return url
    .replace(/^(https?:\/\/|git@)/, '')
    .replace(':', '/')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '-')
    .replace(/\//g, '-');
}

export function cloneRepoIfNeeded(repoUrl: string, branch?: string): string | null {
  const slug = repoSlugFromUrl(repoUrl);
  const localPath = join(REPOS_DIR, slug);

  if (existsSync(localPath) && isGitRepo(localPath)) {
    console.log(`[git] Repo already cloned at ${localPath}, skipping`);
    return localPath;
  }

  try {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (hasGlobalSshKey()) {
      const keyPath = getSshKeyPath(GLOBAL_SSH_KEY_NAME);
      env['GIT_SSH_COMMAND'] = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o BatchMode=yes`;
    }
    mkdirSync(localPath, { recursive: true });
    const branchFlag = branch ? `--branch "${branch}" ` : '';
    execSync(`git clone ${branchFlag}"${repoUrl}" "${localPath}"`, { env, stdio: 'pipe' });
    console.log(`[git] Cloned ${repoUrl} into ${localPath}`);
    return localPath;
  } catch (err) {
    console.warn('[git] cloneRepoIfNeeded failed:', err);
    return null;
  }
}

export function syncFromRemote(localPath: string, gitSync: GitSync): { ok: boolean; error?: string } {
  try {
    // Build extra env for auth
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    let remoteUrl = gitSync.remoteUrl;

    if (gitSync.authMethod === 'ssh' && gitSync.sshKeyName) {
      const keyPath = getSshKeyPath(gitSync.sshKeyName);
      env['GIT_SSH_COMMAND'] = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o BatchMode=yes`;
    }

    const isPopulated = existsSync(localPath) && (() => {
      try { return readdirSync(localPath).length > 0; } catch { return false; }
    })();

    if (!isPopulated) {
      // Clone fresh
      mkdirSync(localPath, { recursive: true });
      execSync(
        `git clone --branch "${gitSync.branch}" --depth 1 "${remoteUrl}" "${localPath}"`,
        { env, stdio: 'pipe' }
      );
    } else if (isGitRepo(localPath)) {
      // Pull latest, remote wins
      execSync(`git fetch origin`, { cwd: localPath, env, stdio: 'pipe' });
      execSync(`git reset --hard "origin/${gitSync.branch}"`, { cwd: localPath, env, stdio: 'pipe' });
    } else {
      return { ok: false, error: 'Local path exists but is not a git repo. Cannot sync.' };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[git] syncFromRemote failed:', msg);
    return { ok: false, error: msg };
  }
}
