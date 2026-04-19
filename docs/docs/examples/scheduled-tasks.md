---
id: scheduled-tasks
title: Scheduled Tasks
sidebar_position: 4
---

# Scheduled Tasks

Agents can run tasks on a cron schedule — useful for daily standups, monitoring alerts, periodic data syncs, or any recurring automation.

## How scheduling works

Schedules are stored in `workspaces/schedules.json`. On server startup, `cronService.init()` reads the file and registers `node-cron` jobs. When a job fires, it calls `claudeService.runTask(agentId, message)` — exactly the same code path as a manual user message.

```
schedules.json
  ↓ on startup
cronService registers node-cron jobs
  ↓ at trigger time
claudeService.runTask(agentId, message)
  ↓
agent:stream events → browser
  ↓
output appended to conversation history
  ↓
agent returns to idle
```

## 1. Create a standup bot

Create an agent named `standup` with this mission:

```
You are a daily standup bot. When triggered, you:
1. Run: git log --since="yesterday" --oneline --all
2. Summarize what was committed across all branches
3. Format the summary as a standup report:
   - Yesterday: [list of commits grouped by author]
   - Blockers: [any merge conflicts, failed CI, open PRs > 3 days old]
4. Keep the report under 200 words
```

Give it `Bash` permission so it can run git commands.

## 2. Open the Schedule modal

Click the **clock icon** on the standup agent's room (or in the AgentSidebar). This opens the **ScheduleModal**.

## 3. Add a schedule

Fill in:

| Field | Value |
|-------|-------|
| Cron expression | `0 9 * * 1-5` |
| Message | `Run the daily standup. Check git log since yesterday and format a team report.` |

Click **Add Schedule**.

## Cron expression reference

```
┌─────── minute (0–59)
│ ┌───── hour (0–23)
│ │ ┌─── day of month (1–31)
│ │ │ ┌─ month (1–12)
│ │ │ │ ┌ day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

| Schedule | Expression |
|----------|-----------|
| Every hour | `0 * * * *` |
| Daily at 8am | `0 8 * * *` |
| Weekdays at 9am | `0 9 * * 1-5` |
| Every 30 minutes | `*/30 * * * *` |
| Every Monday at 10am | `0 10 * * 1` |
| First of month at noon | `0 12 1 * *` |

## 4. View scheduled run output

Scheduled runs appear in the agent's **ChatModal** alongside manual messages — you can see the standup bot's output without sending it a message yourself. Each run is a full conversation turn: user message (the schedule trigger) + agent response.

## 5. Manage via API

```bash
# List all schedules
curl http://localhost:3001/api/schedules

# Create a schedule
curl -X POST http://localhost:3001/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_xyz789",
    "cron": "0 9 * * 1-5",
    "message": "Run the daily standup."
  }'

# Delete a schedule
curl -X DELETE http://localhost:3001/api/schedules/<scheduleId>
```

**Schedule object:**
```ts
{
  id: string;
  agentId: string;
  cron: string;          // cron expression
  message: string;       // message sent to the agent
  createdAt: string;     // ISO 8601
  lastRunAt: string | null;
  nextRunAt: string | null;
}
```

## 6. Example use cases

### Monitoring agent

**Mission:** Check system health every 15 minutes. Alert via Slack if any service is down.

```
Schedule: */15 * * * *
Message: Check the health of all services (run: curl -s http://api.internal/health)
         and post a Slack message to #alerts if any service returns non-200.
```

### Weekly report agent

**Mission:** Every Friday afternoon, summarize the week's GitHub activity.

```
Schedule: 0 16 * * 5
Message: Pull the GitHub activity for this week (run: gh pr list --state merged --limit 20)
         and write a weekly summary in CHANGELOG format.
```

### Data sync agent

**Mission:** Each night, sync data from the source database to the data warehouse.

```
Schedule: 0 2 * * *
Message: Run the nightly ETL sync (run: python scripts/etl_sync.py --date yesterday).
         Log any errors to memory/etl-errors.md.
```

## 7. Server restart behavior

When the server restarts, `cronService.init()` re-reads `schedules.json` and re-registers all jobs. No schedules are lost. If the server was down during a scheduled time, the missed runs are **not** replayed — the agent picks up at the next scheduled time.

If you need guaranteed execution, consider wrapping the agent trigger in a process monitor that checks for missed runs on startup (see [Deployment](../deployment) for PM2 setup).
