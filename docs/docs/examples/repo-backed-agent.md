---
id: repo-backed-agent
title: Repo-Backed Agent
sidebar_position: 3
---

# Repo-Backed Agent

A repo-backed agent works directly inside a git repository. Its code changes are tracked in git on a dedicated branch, while its identity files (`SOUL.md`, `MEMORY.md`, etc.) stay private and are never committed.

## How it works

```
repos/
  my-repo/             ← bare clone (git remote)

workspaces/default/my-agent/
  ├── (tracked by git)    ← your repo's files
  ├── SOUL.md             ← git-ignored via info/exclude
  ├── USER.md             ← git-ignored
  ├── OPS.md              ← git-ignored
  ├── MEMORY.md           ← git-ignored
  ├── TOOLS.md            ← git-ignored
  ├── memory/             ← git-ignored
  └── .claude/            ← git-ignored
```

The workspace is a git worktree checked out to branch `agent/<agentSlug>`. The agent's runtime files are excluded via `.git/info/exclude` — they exist on disk but git never sees them.

## 1. Add an SSH key

Before creating the agent, configure SSH access for the repo host.

In the UI, go to **Settings → SSH Keys** and add the private key that has read/write access to your repo. Keys are stored in `.sync-data/ssh-keys/` with `chmod 600` and are never committed to git.

Alternatively, ensure the key is in your system's SSH agent (`ssh-add ~/.ssh/my_key`) — the server inherits the agent's SSH environment.

## 2. Create the agent with a repo URL

Click **+ New Agent** and fill in:

**Name:** `code-agent`

**Mission:**
```
You are a software engineer working in this repository. When asked to implement
a feature or fix a bug:
1. Read the relevant files first to understand the existing patterns
2. Make targeted, minimal changes
3. Run tests if a test command exists
4. Commit your changes with a descriptive message following the repo's conventions
```

**Repo URL:** `git@github.com:your-org/your-repo.git`

Click **Create**.

The server runs (in sequence):
```bash
# 1. Bare clone (if not already cloned)
git clone --bare git@github.com:your-org/your-repo.git repos/your-repo/

# 2. Create agent branch
git -C repos/your-repo/ branch agent/code-agent

# 3. Create worktree
git -C repos/your-repo/ worktree add \
  /path/to/workspaces/default/code-agent \
  agent/code-agent

# 4. Write info/exclude to hide runtime files
echo ".claude/
SOUL.md
USER.md
OPS.md
MEMORY.md
TOOLS.md
memory/
.mcp.json" >> workspaces/default/code-agent/.git/info/exclude
```

The agent's workspace is now your repo's working tree. Any files it reads, edits, or creates are the actual repo files.

## 3. Grant coding permissions

In the agent's **Permissions** tab, add:

```
Bash
Read
Write
Edit
Glob
Grep
```

This allows the agent to run shell commands, navigate the filesystem, and edit files.

## 4. Send a coding task

Open the ChatModal and send:

```
Look at the open issues in this repo (run: gh issue list --limit 5).
Pick the most critical bug, implement a fix, and commit it.
```

The agent will:

1. Run `Bash: gh issue list --limit 5` — reads open issues
2. Run `Read` on relevant source files — understands the code
3. Run `Edit` to make changes — modifies the files
4. Run `Bash: git diff` — verifies the changes
5. Run `Bash: git add -p && git commit -m "fix: ..."` — commits

The commit goes to branch `agent/code-agent` in the bare clone at `repos/your-repo/`.

## 5. Review and merge

To review what the agent committed:

```bash
# In the repos/ bare clone
git -C repos/your-repo/ log agent/code-agent --oneline -5

# Or push the branch to GitHub for a PR
git -C repos/your-repo/ push origin agent/code-agent
```

Create a PR from `agent/code-agent` → `main` in your normal GitHub workflow. Code review as usual.

## 6. Multiple agents on the same repo

Each agent gets its own branch. You can run multiple agents on the same codebase simultaneously:

```
agent/feature-agent   ← agent_1 working on feature X
agent/bug-agent       ← agent_2 fixing bug Y
agent/refactor-agent  ← agent_3 refactoring module Z
```

There are no conflicts at the worktree level — each agent has its own working tree pointing to its own branch. Merge their work via `git merge` or PRs when ready.

## 7. Keeping branches in sync

If the main branch advances while an agent is working:

```bash
# Inside the agent's worktree
git fetch origin
git rebase origin/main
```

Or send the agent a message:

```
Rebase your branch on the latest main before continuing.
```

The agent can run `git fetch` and `git rebase` itself if it has `Bash` permission.

## Troubleshooting

**Clone fails:** Check that the SSH key is loaded and has repo access. Test with `ssh -T git@github.com` from the server's environment.

**Worktree already exists:** If a previous agent used the same slug, delete its worktree first:
```bash
git -C repos/your-repo/ worktree remove workspaces/default/code-agent --force
```

**Uncommitted changes block rebase:** The agent needs to commit or stash before rebasing. Send a message: `Stash your changes, rebase on main, then pop the stash.`
