import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, relative } from 'path';

// Tool definitions sent to Claude
export const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace. Also reads CLAUDE.md automatically.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file, relative to the workspace root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file, relative to the workspace root.',
        },
        content: {
          type: 'string',
          description: 'The content to write.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to workspace root. Defaults to "." (workspace root).',
        },
      },
      required: [],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the workspace directory. Use for building, testing, running scripts, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
      },
      required: ['command'],
    },
  },
] as const;

// Resolve a workspace-relative path safely (no directory traversal)
function safePath(workspacePath: string, relativePath: string): string {
  const abs = resolve(join(workspacePath, relativePath));
  // Ensure the resolved path is still inside the workspace
  if (!abs.startsWith(resolve(workspacePath))) {
    throw new Error(`Path "${relativePath}" is outside the workspace.`);
  }
  return abs;
}

export type ToolName = 'read_file' | 'write_file' | 'list_directory' | 'run_command';

export interface ToolCall {
  id: string;
  name: ToolName;
  input: Record<string, string>;
}

export function executeTool(workspacePath: string, call: ToolCall): string {
  try {
    switch (call.name) {
      case 'read_file': {
        const abs = safePath(workspacePath, call.input.path);
        if (!existsSync(abs)) return `Error: file not found: ${call.input.path}`;
        return readFileSync(abs, 'utf-8');
      }

      case 'write_file': {
        const abs = safePath(workspacePath, call.input.path);
        // Create parent dirs if needed
        const parentDir = abs.split('/').slice(0, -1).join('/');
        mkdirSync(parentDir, { recursive: true });
        writeFileSync(abs, call.input.content, 'utf-8');
        return `File written: ${call.input.path}`;
      }

      case 'list_directory': {
        const dir = call.input.path || '.';
        const abs = safePath(workspacePath, dir);
        if (!existsSync(abs)) return `Error: directory not found: ${dir}`;
        const entries = readdirSync(abs).map((name) => {
          const fullPath = join(abs, name);
          const isDir = statSync(fullPath).isDirectory();
          return isDir ? `${name}/` : name;
        });
        return entries.length > 0
          ? entries.join('\n')
          : '(empty directory)';
      }

      case 'run_command': {
        try {
          const output = execSync(call.input.command, {
            cwd: workspacePath,
            timeout: 30_000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          return output || '(no output)';
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'stdout' in err && 'stderr' in err) {
            const e = err as { stdout: string; stderr: string; status: number };
            return `Exit code ${e.status}\n${e.stdout || ''}${e.stderr || ''}`.trim();
          }
          return `Error: ${String(err)}`;
        }
      }

      default:
        return `Unknown tool: ${(call as ToolCall).name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Read CLAUDE.md from the workspace if it exists
export function readClaudeMd(workspacePath: string): string | null {
  const claudeMdPath = join(workspacePath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      return readFileSync(claudeMdPath, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

// Read .rules or rules.md if they exist
export function readRules(workspacePath: string): string | null {
  for (const name of ['.rules', 'rules.md', 'RULES.md', '.claude/rules.md']) {
    const p = join(workspacePath, name);
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf-8');
      } catch {
        continue;
      }
    }
  }
  return null;
}

// Summarize tool call for display (truncate large outputs)
export function summarizeTool(call: ToolCall, result: string): string {
  const MAX = 500;
  const truncated = result.length > MAX ? result.slice(0, MAX) + '…' : result;
  return truncated;
}

// Relative path from workspace for display
export function displayPath(workspacePath: string, filePath: string): string {
  try {
    return relative(workspacePath, filePath) || filePath;
  } catch {
    return filePath;
  }
}
