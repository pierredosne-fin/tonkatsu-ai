import type { Server } from 'socket.io';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { anthropic } from '../config.js';
import * as agentService from './agentService.js';
import { notifyDesktop } from './notifyService.js';
import {
  TOOL_DEFINITIONS,
  executeTool,
  readClaudeMd,
  readRules,
  summarizeTool,
  type ToolCall,
} from './toolService.js';

const NEED_INPUT_RE = /<NEED_INPUT>([\s\S]*?)<\/NEED_INPUT>/;
const CALL_AGENT_RE = /<CALL_AGENT name="([^"]+)">([\s\S]*?)<\/CALL_AGENT>/;
const MAX_CALL_DEPTH = 3;
const MAX_TOOL_ITERATIONS = 200; // safety cap on agentic loop

function buildSystemPrompt(
  name: string,
  mission: string,
  workspacePath: string,
  otherAgents: { name: string; mission: string }[]
): string {
  const claudeMd = readClaudeMd(workspacePath);
  const rules = readRules(workspacePath);

  const workspaceSection = `\n\nWORKSPACE: ${workspacePath}
You have full access to this directory via the provided tools (read_file, write_file, list_directory, run_command).`;

  const claudeMdSection = claudeMd
    ? `\n\n--- CLAUDE.md ---\n${claudeMd}\n--- end CLAUDE.md ---`
    : '';

  const rulesSection = rules
    ? `\n\n--- RULES ---\n${rules}\n--- end RULES ---`
    : '';

  const agentList =
    otherAgents.length > 0
      ? `\n\nAVAILABLE AGENTS YOU CAN DELEGATE TO:\n` +
        otherAgents.map((a) => `- ${a.name}: ${a.mission}`).join('\n') +
        `\n\nTo delegate work to another agent, include in your text response:\n  <CALL_AGENT name="AgentName">Your specific request here</CALL_AGENT>\n(Only one delegation per response. Their answer will be provided to you.)\n\nWhen a user message contains @AgentName, they want you to delegate the relevant work to that agent using CALL_AGENT.`
      : '';

  return `You are ${name}, an AI agent working autonomously. Your mission: ${mission}${workspaceSection}${claudeMdSection}${rulesSection}

Work on your mission step by step. Use your tools to read/write files and run commands.
Be terse. No preamble, no summaries, no explaining what you're about to do — just act and give brief status when done.

IMPORTANT PROTOCOL:
- If you need information or a decision from the user to proceed, end your final text response with:
  <NEED_INPUT>Your specific question here</NEED_INPUT>
- To delegate to another agent, end your final text response with:
  <CALL_AGENT name="AgentName">Your specific request</CALL_AGENT>
- Otherwise, complete your work and end normally.${agentList}`;
}

// ─── Agentic tool-use loop ──────────────────────────────────────────────────

async function runAgenticLoop(
  agentId: string,
  messages: MessageParam[],
  systemPrompt: string,
  io: Server,
  signal: AbortSignal
): Promise<{ finalText: string; stopped: boolean }> {
  let iterationMessages = [...messages];
  let finalText = '';
  let stopped = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Stream the response
    const stream = anthropic.messages.stream(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS as never,
        messages: iterationMessages,
      },
      { signal }
    );

    // Collect text chunks + tool use blocks from the stream
    let textChunk = '';
    const toolCalls: ToolCall[] = [];
    let currentTool: { id: string; name: string; inputStr: string } | null = null;

    for await (const event of stream) {
      if (signal.aborted) { stopped = true; break; }

      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentTool = {
            id: event.content_block.id,
            name: event.content_block.name,
            inputStr: '',
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textChunk += event.delta.text;
          io.to(`agent:${agentId}`).emit('agent:stream', {
            agentId,
            chunk: event.delta.text,
            done: false,
          });
        } else if (event.delta.type === 'input_json_delta' && currentTool) {
          currentTool.inputStr += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentTool) {
          try {
            toolCalls.push({
              id: currentTool.id,
              name: currentTool.name as ToolCall['name'],
              input: JSON.parse(currentTool.inputStr || '{}'),
            });
          } catch {
            // malformed JSON from stream — skip
          }
          currentTool = null;
        }
      }
    }

    if (stopped) break;

    const finalMsg = await stream.finalMessage();
    finalText = textChunk;

    if (finalMsg.stop_reason !== 'tool_use' || toolCalls.length === 0) {
      // No more tool calls — agentic loop is done
      io.to(`agent:${agentId}`).emit('agent:stream', {
        agentId,
        chunk: '',
        done: true,
      });
      break;
    }

    // Execute each tool call
    const toolResults: ToolResultBlockParam[] = [];
    const agent = agentService.getAgent(agentId);

    for (const call of toolCalls) {
      // Emit tool call event to UI
      io.to(`agent:${agentId}`).emit('agent:toolCall', {
        agentId,
        toolCallId: call.id,
        tool: call.name,
        input: call.input,
      });

      const rawResult = agent
        ? executeTool(agent.workspacePath, call)
        : 'Agent workspace not available.';

      // Cap tool results at 8k chars to avoid blowing the context window
      const MAX_RESULT = 8000;
      const result = rawResult.length > MAX_RESULT
        ? rawResult.slice(0, MAX_RESULT) + `\n\n[...truncated — ${rawResult.length - MAX_RESULT} chars omitted. Use more specific paths/commands to get the rest.]`
        : rawResult;

      const preview = summarizeTool(call, result);

      // Emit result event to UI
      io.to(`agent:${agentId}`).emit('agent:toolResult', {
        agentId,
        toolCallId: call.id,
        tool: call.name,
        result: preview,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: result,
      });
    }

    // On the last iteration, inject a nudge so the model writes a text summary
    const isLastIteration = i === MAX_TOOL_ITERATIONS - 1;
    iterationMessages = [
      ...iterationMessages,
      { role: 'assistant', content: finalMsg.content },
      {
        role: 'user',
        content: isLastIteration
          ? [...toolResults, { type: 'text', text: 'You have used the maximum number of tool calls. Please now write your full response / summary based on everything you have gathered so far. No more tool calls.' }]
          : toolResults,
      },
    ];
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

  // Mark target as working
  agentService.setStatus(target.id, 'working');
  io.emit('agent:statusChanged', { agentId: target.id, status: 'working' });
  notifyDesktop(target.name, 'working');

  // Record the incoming message in target's history
  agentService.appendMessage(target.id, { role: 'user', content: message });
  io.emit('agent:message', { agentId: target.id, message: { role: 'user', content: message } });

  const othersForTarget = agentService
    .getAllAgents()
    .filter((a) => a.id !== target.id && a.id !== callerAgentId && a.teamId === target.teamId)
    .map((a) => ({ name: a.name, mission: a.mission }));

  const systemPrompt = buildSystemPrompt(
    target.name,
    target.mission,
    target.workspacePath,
    othersForTarget
  );

  const controller = new AbortController();
  let subResponse = '';

  try {
    const targetHistory = agentService.getAgent(target.id)!.conversationHistory.map(
      (m) => ({ role: m.role, content: m.content })
    );

    const { finalText } = await runAgenticLoop(
      target.id,
      targetHistory,
      systemPrompt,
      io,
      controller.signal
    );
    subResponse = finalText;

    // Handle nested delegation (one level)
    const subCallMatch = CALL_AGENT_RE.exec(subResponse);
    if (subCallMatch) {
      const subTargetName = subCallMatch[1];
      const subMessage = subCallMatch[2].trim();
      const nestedResult = await runSubAgent(
        target.id,
        subTargetName,
        subMessage,
        io,
        depth + 1
      );
      subResponse =
        subResponse.replace(CALL_AGENT_RE, '').trim() +
        `\n\n[${subTargetName} responded]: ${nestedResult}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    subResponse = `[Agent "${targetName}" encountered an error: ${msg}]`;
  }

  // Record the response in target's history and mark sleeping
  agentService.appendMessage(target.id, { role: 'assistant', content: subResponse });
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

  const systemPrompt = buildSystemPrompt(
    agent.name,
    agent.mission,
    agent.workspacePath,
    otherAgents
  );

  const messages: MessageParam[] =
    agent.conversationHistory.length > 0
      ? agent.conversationHistory.map((m) => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: 'Begin working on your mission.' }];

  // Anthropic requires the last message to be from the user
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: 'Continue working on your mission.' });
  }

  try {
    const { finalText, stopped } = await runAgenticLoop(
      agentId,
      messages,
      systemPrompt,
      io,
      controller.signal
    );

    agentService.clearAbortController(agentId);

    if (stopped) {
      agentService.setStatus(agentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId, status: 'sleeping' });
      notifyDesktop(agent.name, 'sleeping');
      return;
    }

    if (finalText.trim()) {
      agentService.appendMessage(agentId, { role: 'assistant', content: finalText });
      io.emit('agent:message', { agentId, message: { role: 'assistant', content: finalText } });
    }

    // Check delegation
    const callMatch = CALL_AGENT_RE.exec(finalText);
    if (callMatch && depth < MAX_CALL_DEPTH) {
      const targetName = callMatch[1];
      const delegatedMessage = callMatch[2].trim();

      // Caller waits for the sub-agent — show delegating status
      agentService.setStatus(agentId, 'delegating');
      io.emit('agent:statusChanged', { agentId, status: 'delegating' });

      const subResponse = await runSubAgent(
        agentId,
        targetName,
        delegatedMessage,
        io,
        depth + 1
      );

      const delegationReply = { role: 'user' as const, content: `[${targetName} responded]: ${subResponse}` };
      agentService.appendMessage(agentId, delegationReply);
      io.emit('agent:message', { agentId, message: delegationReply });

      agentService.setStatus(agentId, 'sleeping');
      await runAgentTask(agentId, io, depth + 1);
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
