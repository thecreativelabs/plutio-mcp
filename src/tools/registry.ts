import type { ResourceSpec } from "./factory.js";

/**
 * The single source of truth for which Plutio resources the MCP server exposes.
 *
 * HOW TO CUSTOMIZE (this is where your domain knowledge matters most):
 *
 *   - Reword `description` fields so the agent picks the right tool for YOUR workflow
 *     (e.g. if you use "Leads" not "People", mention that in the description).
 *   - Add `readOnly: true` to resources that should never be written by the agent
 *     even when PLUTIO_READ_ONLY=false (e.g. `businesses` — the workspace itself).
 *   - Remove resources you don't use so the tool list stays focused.
 *
 * All paths are verified against Plutio's public API surface at v1.11
 * (https://docs.plutio.com/).
 */
export const RESOURCES: ResourceSpec[] = [
  // ─── CRM ─────────────────────────────────────────────────────────────────
  {
    name: "people",
    path: "people",
    category: "crm",
    description:
      "People in your Plutio workspace — contacts, clients, leads, team members. Supports MongoDB-style filtering (e.g. by tags, custom fields, status).",
    archive: true,
    bulk: true,
  },
  {
    name: "companies",
    path: "companies",
    category: "crm",
    description:
      "Organizations/accounts associated with people. Link people to companies via the `companyId` field on person records.",
    bulk: true,
  },
  {
    name: "notes",
    path: "notes",
    category: "crm",
    description:
      "Free-form notes attached to people, companies, projects, or other records. Use the `recordId` + `recordType` fields to associate.",
  },

  // ─── Project Management ──────────────────────────────────────────────────
  {
    name: "projects",
    path: "projects",
    category: "project-management",
    description:
      "Projects — the top-level container for tasks, time entries, invoices, proposals, and contracts. Links to people/companies.",
    archive: true,
    bulk: true,
  },
  {
    name: "tasks",
    path: "tasks",
    category: "project-management",
    description:
      "Individual work items. Associated with a project via `projectId` and organized by `taskBoardId` / `taskGroupId`.",
    archive: true,
    bulk: true,
  },
  {
    name: "task_boards",
    path: "task-boards",
    category: "project-management",
    description:
      "Kanban-style boards grouping tasks. Each task belongs to one board; each board has multiple groups (columns).",
    bulk: true,
  },
  {
    name: "task_groups",
    path: "task-groups",
    category: "project-management",
    description: "Columns within a task board — e.g. 'To Do', 'In Progress', 'Done'.",
    bulk: true,
  },
  {
    name: "statuses",
    path: "statuses",
    category: "project-management",
    description: "Custom status definitions used across projects and tasks.",
  },

  // ─── Time & Scheduling ───────────────────────────────────────────────────
  {
    name: "time_entries",
    path: "time-tracks",
    category: "time-tracking",
    description:
      "Billable and non-billable time logs. Associate with tasks/projects via `taskId`/`projectId`. Fields: `startAt`, `endAt`, `duration`, `description`, `isBillable`.",
    bulk: true,
  },
  {
    name: "time_categories",
    path: "categories",
    category: "time-tracking",
    description:
      "Time-tracking categories (note: Plutio's `categories` endpoint may cover multiple record types — use with care).",
  },
  {
    name: "schedules",
    path: "schedules",
    category: "scheduling",
    description:
      "Per-person weekly availability schedules (working hours). Each record has `entityType: 'person'`, `entityId`, `isSharedPublicly`, and a 7-entry `days` array `[{isActive, times: [{start: 'HH:MM', end: 'HH:MM'}]}]` (index 0 = Sunday). Useful for querying 'who's available Tuesday at 2pm'. Note: booking pages (Calendly-like) are a separate feature — see the `scheduler` endpoint via `plutio_request` if configured.",
  },
  {
    name: "events",
    path: "events",
    category: "scheduling",
    description: "Calendar events — meetings, deadlines, reminders. Link to projects or people.",
    bulk: true,
  },

  // ─── Financial ───────────────────────────────────────────────────────────
  {
    name: "invoices",
    path: "invoices",
    category: "financial",
    description:
      "Client invoices. Fields include `items`, `currency`, `dueDate`, `status`, `clientId`, `projectId`. Line items live inline under `items`.",
    archive: true,
    bulk: true,
  },
  {
    name: "invoice_subscriptions",
    path: "invoice-subscriptions",
    category: "financial",
    description:
      "Recurring invoice subscriptions (e.g. monthly retainers, annual renewals). Supports full RRULE (`repeat.rrule`). Key fields: `title`, `client`, `amount`, `currency`, `repeat: {intervalType, interval, rrule, monthDay, yearMonth, yearMonthDay, action}`, `mainInvoiceId`, `paymentOptions`, `status` (draft/active/paused/cancelled), `startDate`, `upcomingInvoiceDate`, `lastChargeAttemptedAt`. IMPORTANT: `get` by id is not supported — use `list` with a `_id` or title filter. Status transitions (pause/resume/cancel) are NOT settable via REST; update the record in Plutio's web UI.",
    bulk: true,
    noGet: true,
  },
  {
    name: "transactions",
    path: "transactions",
    category: "financial",
    description:
      "Payment records linked to invoices — captures amount, currency, method, and status.",
    bulk: true,
  },

  // ─── Documents ───────────────────────────────────────────────────────────
  {
    name: "proposals",
    path: "proposals",
    category: "documents",
    description:
      "Sales proposals and scoping documents. Support client approval workflows and acceptance tracking.",
    archive: true,
    bulk: true,
  },
  {
    name: "contracts",
    path: "contracts",
    category: "documents",
    description:
      "Service agreements with e-signature support. Link to projects and proposals.",
    archive: true,
    bulk: true,
  },

  // ─── Forms / Marketing / Leads ───────────────────────────────────────────
  {
    name: "forms",
    path: "forms",
    category: "forms",
    description:
      "Lead capture, intake, and survey forms. Each submission creates a `form-responses` record — use that alongside `people` to manage incoming leads.",
    bulk: true,
  },
  {
    name: "form_responses",
    path: "form-responses",
    category: "forms",
    description: "Submissions from your forms — raw lead data before you qualify and convert to `people`.",
    bulk: true,
  },

  // ─── Communication ───────────────────────────────────────────────────────
  {
    name: "conversations",
    path: "conversations",
    category: "communication",
    description:
      "Threaded conversations with clients or team members — Plutio's built-in inbox.",
    bulk: true,
  },
  {
    name: "comments",
    path: "comments",
    category: "communication",
    description:
      "Comments attached to specific records. IMPORTANT: list requires either `_id` OR both `entityType` + `entityId` in the query — e.g. {entityType: 'task', entityId: '<id>'}.",
    bulk: true,
  },

  // ─── Knowledge / Content ─────────────────────────────────────────────────
  {
    name: "templates",
    path: "templates",
    category: "knowledge",
    description:
      "Reusable templates for proposals, contracts, invoices, and form definitions.",
    bulk: true,
  },
  {
    name: "canned_responses",
    path: "canned-responses",
    category: "knowledge",
    description: "Reusable response snippets — Plutio's canned replies for emails, messages, and conversations.",
  },
  {
    name: "wiki_pages",
    path: "wiki",
    category: "knowledge",
    description: "Internal knowledge-base / wiki pages.",
    bulk: true,
  },
  {
    name: "items",
    path: "items",
    category: "knowledge",
    description:
      "Generic line-item records (often used for invoice/proposal products and services catalogs).",
    bulk: true,
  },

  // ─── Files ───────────────────────────────────────────────────────────────
  {
    name: "file_folders",
    path: "file-folders",
    category: "files",
    description:
      "Folder hierarchy for organizing files. Each folder has `entityType`, `entityId`, and optional `parentFolderId`.",
    bulk: true,
  },
  {
    name: "files",
    path: "files",
    category: "files",
    description: "Uploaded files — metadata plus `url`, `handle`, `mimeType`, `size`, `linkedEntities`.",
    bulk: true,
  },

  // ─── Automation ──────────────────────────────────────────────────────────
  {
    name: "automations",
    path: "automations",
    category: "admin",
    description:
      "Plutio's native node-based automation system. Each record represents a workflow with `moduleId`, `status` (draft/active/paused), `nodes[]`, `edges[]`, `triggerType`, `triggerConfig`, `metadata: {runCount, errorCount}`, `triggerActivity: {runCount, successCount, failureCount, lastRun}`. Best used to audit what automations are configured. IMPORTANT: `get` by id and `delete` are blocked by Plutio's REST API — manage automations in the web UI. List + create are supported (a new POST creates an empty draft).",
    noGet: true,
    noDelete: true,
    bulk: false,
  },

  // ─── Analytics / Admin ───────────────────────────────────────────────────
  {
    name: "dashboards",
    path: "dashboards",
    category: "analytics",
    description: "Custom dashboards — list, read, or build new visualizations.",
  },
  {
    name: "custom_fields",
    path: "custom-fields",
    category: "admin",
    description:
      "Definitions for custom fields attached to any resource. To set a custom field value on a record, include a `customFields` array on that record.",
    bulk: true,
  },
  {
    name: "businesses",
    path: "businesses",
    category: "admin",
    description:
      "Your Plutio workspace settings. Typically read-only — avoid writing unless you know what you're doing.",
    readOnly: true,
    bulk: false,
  },
];
