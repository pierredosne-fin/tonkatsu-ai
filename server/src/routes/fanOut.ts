import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import { pendingFanOuts, runAgentTask } from '../services/claudeService.js';
import * as agentService from '../services/agentService.js';

const CONCURRENCY_LIMIT = 3;

export function createFanOutRouter(io: Server): Router {
  const router = Router();

  router.post('/:proposalId/confirm', (req, res) => {
    const proposal = pendingFanOuts.get(req.params.proposalId);
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found or expired' });
      return;
    }

    pendingFanOuts.delete(proposal.id);

    const fanoutId = randomUUID();

    interface ResolvedTask {
      taskId: string;
      targetAgentId: string;
      taskSnippet: string;
      prompt: string;
    }

    const resolvedTasks: ResolvedTask[] = proposal.tasks.flatMap((task) => {
      const target = agentService.findAgentByName(task.agent, proposal.teamId);
      if (!target) {
        console.warn(`[fan-out] agent "${task.agent}" not found at dispatch time — skipping`);
        return [];
      }
      return [{
        taskId: randomUUID(),
        targetAgentId: target.id,
        taskSnippet: task.prompt.slice(0, 120),
        prompt: task.prompt,
      }];
    });

    if (resolvedTasks.length === 0) {
      res.status(422).json({ error: 'No resolvable targets' });
      return;
    }

    // Emit fanout:dispatched immediately so the client can render the progress panel
    io.emit('fanout:dispatched', {
      fanoutId,
      sourceAgentId: proposal.fromAgentId,
      tasks: resolvedTasks.map(({ taskId, targetAgentId, taskSnippet }) => ({
        taskId,
        targetAgentId,
        taskSnippet,
      })),
    });

    // Source agent enters broadcasting status while tasks run
    agentService.setStatus(proposal.fromAgentId, 'broadcasting');
    io.emit('agent:statusChanged', { agentId: proposal.fromAgentId, status: 'broadcasting' });

    const dispatchAll = async () => {
      const results: Array<{ taskId: string; status: 'done' | 'failed' }> = [];

      for (let i = 0; i < resolvedTasks.length; i += CONCURRENCY_LIMIT) {
        const batch = resolvedTasks.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(
          batch.map(async ({ taskId, targetAgentId, prompt }) => {
            io.emit('fanout:taskStarted', { fanoutId, taskId, targetAgentId });
            try {
              await runAgentTask(targetAgentId, io, prompt);
              io.emit('fanout:taskComplete', { fanoutId, taskId, targetAgentId, status: 'done' });
              results.push({ taskId, status: 'done' });
            } catch (err) {
              console.error(`[fan-out] task ${taskId} failed:`, err);
              io.emit('fanout:taskComplete', { fanoutId, taskId, targetAgentId, status: 'failed' });
              results.push({ taskId, status: 'failed' });
            }
          })
        );
      }

      agentService.setStatus(proposal.fromAgentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId: proposal.fromAgentId, status: 'sleeping' });
      io.emit('fanout:complete', { fanoutId, sourceAgentId: proposal.fromAgentId, results });
    };

    dispatchAll().catch((err) => {
      console.error('[fan-out] dispatchAll error:', err);
      agentService.setStatus(proposal.fromAgentId, 'sleeping');
      io.emit('agent:statusChanged', { agentId: proposal.fromAgentId, status: 'sleeping' });
    });

    res.json({ dispatched: resolvedTasks.length, fanoutId });
  });

  router.post('/:proposalId/reject', (req, res) => {
    const existed = pendingFanOuts.delete(req.params.proposalId);
    res.json({ rejected: existed });
  });

  return router;
}
