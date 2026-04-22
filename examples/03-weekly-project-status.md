# 03 — Weekly project status report

Takes ~10 tool calls, produces a crisp exec-ready summary.

## Prompt

> Generate a status report across all active projects. For each, include: % of tasks complete, hours logged this week, and any tasks in progress for more than 7 days without an update.

## What Claude will do

1. **`plutio_projects`** list with `{"status": "active"}`.
2. For each project:
    - **`plutio_tasks`** list with `{"projectId": <id>}` → compute `completed / total`.
    - **`plutio_time_entries`** list with `{"projectId": <id>, "startAt": {"$gte": "<monday ISO>"}}` → sum `duration`.
    - Filter tasks with `status != "done"` and `updatedAt < <last Monday>` → "stalled" list.

## Example answer

```
Website Redesign (Acme Corp)
  Progress: 18/29 tasks done (62%)
  Time this week: 14.5h
  Stalled: "Mobile breakpoints review" (10d), "Stakeholder approval" (12d)

Mobile App Phase 2 (Jane Doe)
  Progress: 3/22 tasks (14%) — just kicked off
  Time this week: 2.0h
  Stalled: none

Onboarding Automation (Example LLC)
  Progress: 8/8 tasks (100%) — ready to close
  Time this week: 0h
  ⚠️ Project still marked active — consider archiving
```

## Why this works

`tasks` records include `projectId`, `status`, and `updatedAt`. `time-tracks` records include `projectId`, `startAt`, and `duration` (milliseconds). Aggregation is simple enough for the agent to do in-memory.

## Performance note

For a workspace with 50+ active projects, consider running the time-entries aggregation server-side via `plutio_request` with an aggregation query, rather than one API call per project.
