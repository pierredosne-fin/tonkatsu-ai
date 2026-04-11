import cron from 'node-cron';
import { randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import type { CronSchedule } from '../models/types.js';
import { loadSchedules, saveSchedules } from './persistenceService.js';
import { getAgent } from './agentService.js';
import { runAgentTask } from './claudeService.js';

const schedules = new Map<string, CronSchedule>();
const tasks = new Map<string, cron.ScheduledTask>();

function registerCronJob(schedule: CronSchedule, io: Server): void {
  if (!cron.validate(schedule.cronExpression)) {
    console.warn(`[cronService] Invalid cron expression for schedule ${schedule.id}: "${schedule.cronExpression}"`);
    return;
  }
  const task = cron.schedule(schedule.cronExpression, () => {
    const agent = getAgent(schedule.agentId);
    if (!agent) {
      console.warn(`[cronService] Agent ${schedule.agentId} not found for schedule ${schedule.id}, skipping`);
      return;
    }
    if (agent.status === 'working' || agent.status === 'delegating') {
      console.log(`[cronService] Agent ${agent.name} is busy, skipping schedule ${schedule.id}`);
      return;
    }
    console.log(`[cronService] Firing schedule ${schedule.id} for agent ${agent.name}`);
    io.emit('agent:message', { agentId: agent.id, message: { role: 'user', content: schedule.message } });
    runAgentTask(schedule.agentId, io, schedule.message).catch((err) =>
      console.error(`[cronService] runAgentTask error for ${schedule.agentId}:`, err)
    );
    schedule.lastFiredAt = new Date().toISOString();
    schedules.set(schedule.id, schedule);
    saveSchedules(Array.from(schedules.values()));
  });
  tasks.set(schedule.id, task);
}

function stopTask(scheduleId: string): void {
  const task = tasks.get(scheduleId);
  if (task) {
    task.stop();
    tasks.delete(scheduleId);
  }
}

export function initSchedules(io: Server): void {
  const loaded = loadSchedules();
  for (const s of loaded) {
    schedules.set(s.id, s);
    if (s.enabled) {
      registerCronJob(s, io);
    }
  }
  console.log(`[cronService] Loaded ${loaded.length} schedule(s)`);
}

export function getAllSchedules(): CronSchedule[] {
  return Array.from(schedules.values());
}

export function getSchedulesForAgent(agentId: string): CronSchedule[] {
  return Array.from(schedules.values()).filter((s) => s.agentId === agentId);
}

export function createSchedule(
  params: { agentId: string; cronExpression: string; message: string; enabled?: boolean },
  io: Server,
): CronSchedule | { error: string } {
  if (!cron.validate(params.cronExpression)) {
    return { error: 'Invalid cron expression' };
  }
  const schedule: CronSchedule = {
    id: randomUUID(),
    agentId: params.agentId,
    cronExpression: params.cronExpression,
    message: params.message,
    enabled: params.enabled ?? true,
    createdAt: new Date().toISOString(),
  };
  schedules.set(schedule.id, schedule);
  saveSchedules(Array.from(schedules.values()));
  if (schedule.enabled) {
    registerCronJob(schedule, io);
  }
  return schedule;
}

export function updateSchedule(
  id: string,
  params: { cronExpression?: string; message?: string; enabled?: boolean },
  io: Server,
): CronSchedule | null {
  const schedule = schedules.get(id);
  if (!schedule) return null;

  if (params.cronExpression !== undefined && !cron.validate(params.cronExpression)) {
    return null;
  }

  stopTask(id);

  const updated: CronSchedule = {
    ...schedule,
    ...(params.cronExpression !== undefined && { cronExpression: params.cronExpression }),
    ...(params.message !== undefined && { message: params.message }),
    ...(params.enabled !== undefined && { enabled: params.enabled }),
  };
  schedules.set(id, updated);
  saveSchedules(Array.from(schedules.values()));

  if (updated.enabled) {
    registerCronJob(updated, io);
  }
  return updated;
}

export function deleteSchedule(id: string): boolean {
  if (!schedules.has(id)) return false;
  stopTask(id);
  schedules.delete(id);
  saveSchedules(Array.from(schedules.values()));
  return true;
}

export function deleteSchedulesForAgent(agentId: string): void {
  for (const [id, s] of schedules) {
    if (s.agentId === agentId) {
      stopTask(id);
      schedules.delete(id);
    }
  }
  saveSchedules(Array.from(schedules.values()));
}
