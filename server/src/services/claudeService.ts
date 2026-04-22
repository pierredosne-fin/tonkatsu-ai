import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as agentService from './agentService.js';
import { notifyDesktop } from './notifyService.js';
import type { FanOutProposal, FanOutTask } from '../models/types.js';
import { emitThrottledStream, emitToZoomedRooms } from './zoomService.js';

const NEED_INPUT_RE = /<NEED_INPUT>([\s\S]*?)<\/NEED_INPUT>/;
const CALL_AGENT_RE = /<CALL_AGENT name="([^"]+)">([\s\S]*?)<\/CALL_AGENT>/;
const FAN_OUT_RE = /<FAN_OUT>([\s\S]*?)<\/FAN_OUT>/;
const TASK_RE = /<TASK agent="([^"]+)">([\s\S]*?)<\/TASK>/g;
const MAX_CALL_DEPTH = 5;
const FAN_OUT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const pendingFanOuts = new Map<string, FanOutProposal>();

// Build the append portion of the system prompt (agent identity + delegation protocol).
// CLAUDE.md, workspace rules, and skills are loaded natively by the SDK via settingSources.
function buildSystemPromptAppend(
  name: string,
  mission: string,
  teamId: string,
  otherAgents: { name: string; mission: string }[],
  canCreateAgents: boolean,
): string {
  const agentList =
    otherAgents.length > 0
      ? `\n\nAVAILABLE AGENTS YOU CAN DELEGATE TO:\n` +
        otherAgents.map((a) => `- ${a.name}: ${a.mission}`).join('\n') +
        `\n\nTo delegate work to another agent, include in your text response:\n  <CALL_AGENT name="AgentName">Your specific request here</CALL_AGENT>\n(Only one delegation per response. Their answer will be provided to you.)\n\nWhen a user message contains @AgentName, they want you to delegate the relevant work to that agent using CALL_AGENT.\n\nTo dispatch multiple tasks to multiple agents IN PARALLEL (fire-and-forget — you will NOT receive their responses), use:\n  <FAN_OUT>\n    <TASK agent="AgentName">Task description</TASK>\n    <TASK agent="AnotherAgent">Another task</TASK>\n  </FAN_OUT>\nIMPORTANT: FAN_OUT requires user confirmation before any tasks are dispatched. The user will see a confirmation dialog. Use this for parallel independent work where you do not need the results back.`
      : '';

  const createAgentInstructions = canCreateAgents
    ? `\n\nCREATE AGENT CAPABILITY:\nYou can create new agents in your team by running this bash command:\n  curl -s -X POST http://localhost:3001/api/agents \\\n    -H 'Content-Type: application/json' \\\n    -d '{"name":"AgentName","mission":"Agent mission...","teamId":"${teamId}","avatarColor":"#6366f1"}'\nAvailable colors: #6366f1 (indigo), #10b981 (emerald), #f59e0b (amber), #ef4444 (red), #8b5cf6 (violet), #06b6d4 (cyan)\nThe new agent will start working automatically after creation. You can then delegate to it using CALL_AGENT.`
    : '';

  return `You are ${name}, an AI agent working autonomously. Your mission: ${mission}

Work on your mission step by step.
Be terse. No preamble, no summaries, no explaining what you're about to do — just act and give brief status when done.

WORKSPACE STRUCTURE:
- SOUL.md     — your identity and principles
- USER.md     — context about the human operator
- OPS.md      — your operational playbook
- MEMORY.md   — curated long-term memory (keep concise, update regularly)
- TOOLS.md    — environment notes, tools, endpoints
- memory/     — append-only daily logs (memory/YYYY-MM-DD.md) and project docs (memory/projects/)

Before starting any task: read MEMORY.md and today's log in memory/.
After completing work: append key learnings to today's log and update MEMORY.md if needed.

IMPORTANT PROTOCOL:
- If you need information or a decision from the user to proceed, end your final text response with:
  <NEED_INPUT>Your specific question here</NEED_INPUT>
- To delegate to another agent, end your final text response with:
  <CALL_AGENT name="AgentName">Your specific request</CALL_AGENT>
- Otherwise, complete your work and end normally.${agentList}${createAgentInstructions}`;
}

// ─── Core SDK execution ─────────────────────────────────────────────────────

function readAllowedTools(workspacePath: string): string[] {
  try {
    const raw = readFileSync(join(workspacePath, '.claude', 'settings.json'), 'utf-8');
    const settings = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    return settings?.permissions?.allow ?? [];
  } catch {
    return [];
  }
}

async function runSDKQuery(
  agentId: string,
  prompt: string,
  sessionId: string | undefined,
  appendPrompt: string,
  cwd: string,
  io: Server,
  abortController: AbortController
): Promise<{ finalText: string; stopped: boolean }> {
  let finalText = '';
  let stopped = false;
  const toolNameById = new Map<string, string>();
  let pendingToolCall: { id: string; name: string; inputStr: string } | null = null;
  const allowedTools = readAllowedTools(cwd);

  const executeQuery = async (resumeId: string | undefined) => {
    const sdkQuery = query({
      prompt,
      options: {
        cwd,
        settingSources: ['project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: appendPrompt,
        },
        permissionMode: 'acceptEdits',
        allowedTools,
        abortController,
        resume: resumeId,
        maxTurns: 200,
        model: 'claude-sonnet-4-6',
        includePartialMessages: true,
      },
    });

    for await (const message of sdkQuery) {
      if (abortController.signal.aborted) {
        stopped = true;
        break;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        agentService.setSessionId(agentId, message.session_id);
        continue;
      }

      if (message.type === 'stream_event') {
        const event = message.event;
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            pendingToolCall = {
              id: event.content_block.id,
              name: event.content_block.name,
              inputStr: '',
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            emitThrottledStream(io, agentId, event.delta.text, false);
          } else if (event.delta.type === 'input_json_delta' && pendingToolCall) {
            pendingToolCall.inputStr += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (pendingToolCall) {
            try {
              const input = JSON.parse(pendingToolCall.inputStr || '{}') as Record<string, unknown>;
              toolNameById.set(pendingToolCall.id, pendingToolCall.name);
              emitToZoomedRooms(io, agentId, 'agent:toolCall', {
                agentId,
                toolCallId: pendingToolCall.id,
                tool: pendingToolCall.name,
                input,
              });
            } catch {
              // malformed JSON — skip
            }
            pendingToolCall = null;
          }
        }
        continue;
      }

      if (message.type === 'assistant') {
        const textParts = message.message.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text);
        if (textParts.length > 0) finalText = textParts.join('');
        continue;
      }

      if (message.type === 'user') {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null && (block as { type: string }).type === 'tool_result') {
              const tr = block as {
                tool_use_id: string;
                content?: string | Array<{ type: string; text?: string }>;
              };
              const rawContent =
                typeof tr.content === 'string'
                  ? tr.content
                  : Array.isArray(tr.content)
                    ? tr.content.map((c) => c.text ?? '').join('')
                    : '';
              const MAX_PREVIEW = 500;
              const preview = rawContent.length > MAX_PREVIEW ? rawContent.slice(0, MAX_PREVIEW) + '…' : rawContent;
              emitToZoomedRooms(io, agentId, 'agent:toolResult', {
                agentId,
                toolCallId: tr.tool_use_id,
                tool: toolNameById.get(tr.tool_use_id) ?? '',
                result: preview,
              });
            }
          }
        }
        continue;
      }

      if (message.type === 'result') {
        emitThrottledStream(io, agentId, '', true);
        if (message.subtype !== 'success') {
          const errors = (message as { errors?: string[] }).errors ?? [];
          const errorMsg = errors.join('; ');
          console.error(`Agent ${agentId} SDK error (${message.subtype}):`, errorMsg);
          // Stale session — clear it so the next run starts fresh instead of looping
          if (message.subtype === 'error_during_execution' && sessionId !== undefined) {
            console.warn(`Agent ${agentId}: clearing stale session ${sessionId}`);
            agentService.clearSessionId(agentId);
          }
          io.emit('agent:error', {
            agentId,
            error: `${message.subtype}${errors.length ? ': ' + errorMsg : ''}`,
          });
        }
        break;
      }
    }
  };

  try {
    await executeQuery(sessionId);
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || abortController.signal.aborted)) {
      stopped = true;
    } else if (sessionId !== undefined) {
      // Stale session ID — clear it and retry fresh
      console.warn(`Agent ${agentId}: session resume failed, retrying without resume. Error:`, err);
      agentService.clearSessionId(agentId);
      pendingToolCall = null;
      finalText = '';
      await executeQuery(undefined);
    } else {
      throw err;
    }
  }

  return { finalText, stopped };
}

// ─── Sub-agent call (delegation) ───────────────────────────────────────────

async function runSubAgent(
  callerAgentId: string,
  targetName: string,
  message: string,
  io: Server,
  depth: number
): Promise<string> {
  if (depth >= MAX_CALL_DEPTH) {
    return `[Agent call refused: maximum delegation depth (${MAX_CALL_DEPTH}) reached]`;
  }

  const caller = agentService.getAgent(callerAgentId);
  const target = agentService
    .getAllAgents()
    .find(
      (a) =>
        a.name.toLowerCase() === targetName.toLowerCase() &&
        a.teamId === caller?.teamId
    );

  if (!target) return `[Agent "${targetName}" not found in this team]`;

  io.emit('agent:delegating', {
    fromAgentId: callerAgentId,
    toAgentId: target.id,
    toAgentName: target.name,
    message,
  });

  agentService.setStatus(target.id, 'working');
  io.emit('agent:statusChanged', { agentId: target.id, status: 'working' });
  notifyDesktop(target.name, 'working');

  io.emit('agent:message', { agentId: target.id, message: { role: 'user', content: message } });

  const othersForTarget = agentService
    .getAllAgents()
    .filter((a) => a.id !== target.id && a.id !== callerAgentId && a.teamId === target.teamId)
    .map((a) => ({ name: a.name, mission: a.mission }));

  const appendPrompt = buildSystemPromptAppend(target.name, target.mission, target.teamId, othersForTarget, target.canCreateAgents ?? false);
  const controller = new AbortController();
  agentService.setAbortController(target.id, controller);
  let subResponse = '';

  try {
    const { finalText } = await runSDKQuery(
      target.id,
      message,
      agentService.getAgent(target.id)?.sessionId,
      appendPrompt,
      target.workspacePath,
      io,
      controller
    );
    subResponse = finalText;

    const subCallMatch = CALL_AGENT_RE.exec(subResponse);
    if (subCallMatch) {
      const subTargetName = subCallMatch[1];
      const subMessage = subCallMatch[2].trim();
      const nestedResult = await runSubAgent(target.id, subTargetName, subMessage, io, depth + 1);
      subResponse =
        subResponse.replace(CALL_AGENT_RE, '').trim() +
        `\n\n[${subTargetName} responded]: ${nestedResult}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    subResponse = `[Agent "${targetName}" encountered an error: ${msg}]`;
  }

  agentService.clearAbortController(target.id);
  io.emit('agent:message', { agentId: target.id, message: { role: 'assistant', content: subResponse } });
  agentService.setStatus(target.id, 'sleeping');
  io.emit('agent:statusChanged', { agentId: target.id, status: 'sleeping' });
  notifyDesktop(target.name, 'sleeping');

  io.emit('agent:delegationComplete', {
    fromAgentId: callerAgentId,
    toAgentId: target.id,
    toAgentName: target.name,
    response: subResponse,
  });

  return subResponse;
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function runAgentTask(
  agentId: string,
  io: Server,
  userMessage?: string,  // explicit prompt; undefined = auto continue/begin
  depth = 0
): Promise<void> {
  const agent = agentService.getAgent(agentId);
  if (!agent) return;
  if (agent.status === 'working') return;

  const controller = new AbortController();
  agentService.setAbortController(agentId, controller);
  agentService.setStatus(agentId, 'working');
  io.emit('agent:statusChanged', { agentId, status: 'working' });
  notifyDesktop(agent.name, 'working');

  const otherAgents = agentService
    .getAllAgents()
    .filter((a) => a.id !== agentId && a.teamId === agent.teamId)
    .map((a) => ({ name: a.name, mission: a.mission }));

  const appendPrompt = buildSystemPromptAppend(agent.name, agent.mission, agent.teamId, otherAgents, agent.canCreateAgents ?? false);
  const prompt = userMessage ?? (agent.sessionId ? 'Continue working on your mission.' : 'Begin working on your mission.');

  try {
    const { finalText, stopped } = await runSDKQuery(
      agentId,
      prompt,
      agent.sessionId,
      appendPrompt,
      agent.workspacePath,
      io,
      controller
    );

    agentService.clearAbortController(agentId);

    if (stopped) {
      agentService.setStatus(agentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
      notifyDesktop(agent.name, 'sleeping');
      return;
    }

    const fanOutMatch = FAN_OUT_RE.exec(finalText);
    const displayText = (fanOutMatch ? finalText.replace(FAN_OUT_RE, '') : finalText).trim();
    if (displayText) {
      io.emit('agent:message', { agentId, message: { role: 'assistant', content: displayText } });
    }

    if (fanOutMatch) {
      const tasks: FanOutTask[] = [];
      for (const m of fanOutMatch[1].matchAll(TASK_RE)) {
        tasks.push({ agent: m[1], prompt: m[2].trim() });
      }

      const missing = tasks
        .map((t) => t.agent)
        .filter((name) => !agentService.findAgentByName(name, agent.teamId));

      if (missing.length > 0) {
        io.emit('agent:error', { agentId, error: `Fan-out failed: unknown agents: ${missing.join(', ')}` });
      } else {
        const proposal: FanOutProposal = { id: randomUUID(), fromAgentId: agentId, teamId: agent.teamId, tasks };
        pendingFanOuts.set(proposal.id, proposal);
        setTimeout(() => pendingFanOuts.delete(proposal.id), FAN_OUT_TTL_MS);
        io.emit('agent:fanOutProposal', proposal);
      }

      agentService.setStatus(agentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
      notifyDesktop(agent.name, 'sleeping');
      return;
    }

    // Check delegation
    const callMatch = CALL_AGENT_RE.exec(finalText);
    if (callMatch && depth < MAX_CALL_DEPTH) {
      const targetName = callMatch[1];
      const delegatedMessage = callMatch[2].trim();

      agentService.setStatus(agentId, 'delegating');
      io.emit('agent:statusChanged', { agentId, status: 'delegating' });

      const subResponse = await runSubAgent(agentId, targetName, delegatedMessage, io, depth + 1);
      const delegationReplyContent = `[${targetName} responded]: ${subResponse}`;
      io.emit('agent:message', { agentId, message: { role: 'user', content: delegationReplyContent } });

      agentService.setStatus(agentId, 'sleeping');
      await runAgentTask(agentId, io, delegationReplyContent, depth + 1);
      return;
    }

    // Check for user input request
    const match = NEED_INPUT_RE.exec(finalText);
    if (match) {
      const question = match[1].trim();
      agentService.setStatus(agentId, 'pending', question);
      io.emit('agent:statusChanged', { agentId, status: 'pending', pendingQuestion: question });
      notifyDesktop(agent.name, 'pending', question);
    } else {
      agentService.setStatus(agentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
      notifyDesktop(agent.name, 'sleeping');
    }
  } catch (err: unknown) {
    agentService.clearAbortController(agentId);
    if (err instanceof Error && err.name === 'AbortError') {
      agentService.setStatus(agentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Agent ${agentId} error:`, message);
    agentService.setStatus(agentId, 'sleeping');
    io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
    io.emit('agent:error', { agentId, error: message });
  }
}
