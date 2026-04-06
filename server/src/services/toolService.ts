import { relative } from 'path';

// Loose tool call type for UI display events (accepts any SDK tool name)
export interface UIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Summarize tool call result for display (truncate large outputs)
export function summarizeTool(_call: UIToolCall, result: string): string {
  const MAX = 500;
  return result.length > MAX ? result.slice(0, MAX) + '…' : result;
}

// Relative path from workspace for display
export function displayPath(workspacePath: string, filePath: string): string {
  try {
    return relative(workspacePath, filePath) || filePath;
  } catch {
    return filePath;
  }
}
