import { execSync } from 'child_process';

export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export function createWorktree(repoPath: string, worktreePath: string, branch: string): boolean {
  try {
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    return true;
  } catch (err) {
    console.warn('[git] Failed to create worktree:', err);
    return false;
  }
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
