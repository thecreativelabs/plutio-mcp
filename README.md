# plutio-mcp

A Model Context Protocol (MCP) server for [Plutio](https://www.plutio.com/) — the all-in-one business platform for CRM, projects, invoicing, proposals, contracts, forms, time tracking, and scheduling.

Gives Claude (and any other MCP client) structured, safe access to **every major resource in your Plutio workspace** via one concise tool per resource.

[![npm](https://img.shields.io/npm/v/@thecreativelabs/plutio-mcp.svg)](https://www.npmjs.com/package/@thecreativelabs/plutio-mcp)
[![CI](https://github.com/thecreativelabs/plutio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/thecreativelabs/plutio-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E=20-brightgreen.svg)](#)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple.svg)](https://modelcontextprotocol.io/)

---

## What you get

- **31 resource-group tools** covering CRM, project management, time tracking, financial, documents, forms, communication, scheduling, knowledge, files, automations, and admin.
- **4 escape-hatch tools** (`plutio_api_reference`, `plutio_workspace_schema`, `plutio_rate_limit_status`, `plutio_request`) for edge cases, workspace introspection, and agent self-orientation.
- **Read-only by default** — no accidental destructive writes until you explicitly enable them.
- **OAuth2 with auto-refresh** — client-credentials grant; tokens refresh ~1 minute before expiry.
- **Built-in rate limiting** — a token bucket capped at Plutio's 1000 req/hr default; requests queue transparently.
- **MongoDB-style filtering** — pass rich query objects directly (`$or`, `$regex`, `$gte`, etc.).
- **Bulk operations** for resources that support them.
- **Typed end-to-end** with Zod → JSON Schema on the wire.

---

## Quick start

### 1. Install

```bash
npm install -g @thecreativelabs/plutio-mcp
# or run without installing:
npx @thecreativelabs/plutio-mcp
```

### 2. Get Plutio API credentials

In your Plutio workspace go to **Settings → API Manager → Create Connection**. You'll get a **Client ID** and **Client Secret**. Copy them — you won't see the secret again.

### 3. Configure Claude Desktop / Claude Code

Add to your MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `.mcp.json` / `.claude/settings.json` for Claude Code):

```json
{
  "mcpServers": {
    "plutio": {
      "command": "npx",
      "args": ["-y", "@thecreativelabs/plutio-mcp"],
      "env": {
        "PLUTIO_CLIENT_ID": "your_client_id",
        "PLUTIO_CLIENT_SECRET": "your_client_secret",
        "PLUTIO_BUSINESS": "your_workspace_slug",
        "PLUTIO_READ_ONLY": "true"
      }
    }
  }
}
```

> `PLUTIO_BUSINESS` is your workspace slug — the subdomain part of `<slug>.plutio.com`. If your OAuth client is tied to exactly one business, you can omit it and the server will auto-detect from the token response. When the client has access to multiple businesses, you must set it explicitly.

Restart Claude. You should now see `plutio_*` tools available.

### 4. Enable writes (when you trust it)

Set `PLUTIO_READ_ONLY=false` to unlock `create`, `update`, `delete`, `archive`, `unarchive`, and bulk operations.

> **How writes actually work inside Plutio's API.** Plutio's public API only supports mutations via bulk endpoints — `PUT /{resource}/{id}` returns 403 everywhere. The MCP server handles this transparently: single-record `update`/`delete`/`archive`/`unarchive` actions route through `/bulk` internally, so from your perspective the tool interface is the usual single-record CRUD. You don't need to think about it — but it explains the version bump to 0.3.0.

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PLUTIO_CLIENT_ID` | yes | — | OAuth2 client ID from Plutio |
| `PLUTIO_CLIENT_SECRET` | yes | — | OAuth2 client secret from Plutio |
| `PLUTIO_BUSINESS` | conditional | auto-detected from token | Workspace slug. Required when your OAuth client has access to multiple businesses |
| `PLUTIO_READ_ONLY` | no | `true` | When `true`, only `list`/`get` actions are exposed |
| `PLUTIO_API_BASE` | no | `https://api.plutio.com/v1.11` | Override for self-hosted / future API versions |
| `PLUTIO_OAUTH_URL` | no | `$PLUTIO_API_BASE/oauth/token` | Override for the token endpoint |
| `PLUTIO_MAX_REQUESTS_PER_HOUR` | no | `1000` | Raise if you have a higher-tier Plutio plan |
| `PLUTIO_LOG_LEVEL` | no | `info` | `error` / `warn` / `info` / `debug` |

See [`.env.example`](.env.example).

---

## Tool catalog

Every resource tool uses the same shape:

```
plutio_<resource>({ action: "list"|"get"|"create"|"update"|"delete"|"archive"|"bulk_*", ...args })
```

### CRM
- `plutio_people` — contacts, clients, leads, team members
- `plutio_companies` — organizations/accounts
- `plutio_notes` — free-form notes on any record

### Project management
- `plutio_projects`
- `plutio_tasks`
- `plutio_task_boards` · `plutio_task_groups` · `plutio_statuses`

### Time tracking
- `plutio_time_entries` — billable/non-billable logs (API path: `/time-tracks`)
- `plutio_time_categories`

### Financial
- `plutio_invoices`
- `plutio_invoice_subscriptions` — recurring invoices
- `plutio_transactions` — payments

### Documents
- `plutio_proposals`
- `plutio_contracts`

### Forms / leads / marketing
- `plutio_forms`
- `plutio_form_responses` — raw submissions before qualification

### Communication
- `plutio_conversations` · `plutio_comments` *(comments requires `entityType` + `entityId` in the query)*

### Scheduling
- `plutio_schedules` — availability windows
- `plutio_events` — calendar entries

### Knowledge
- `plutio_templates` · `plutio_canned_responses` · `plutio_wiki_pages` · `plutio_items`

### Files
- `plutio_file_folders` · `plutio_files`

### Analytics / admin
- `plutio_dashboards`
- `plutio_custom_fields`
- `plutio_automations` — Plutio's native node-based automation workflows *(list + create only; delete and single-GET are blocked by the REST API)*
- `plutio_businesses` *(workspace settings — read-only)*

### Escape hatches
- `plutio_api_reference` — returns a compact map of every tool + API path. Call this first when unsure.
- `plutio_workspace_schema` — introspects your workspace's custom fields. Returns `{entityType: {fieldTitle: {_id, inputType, options: {optionLabel: optionId}}}}`. Call this before any create/update that touches custom fields. Cached for 5 minutes.
- `plutio_request` — raw API passthrough: `{ method, path, query?, body? }`.
- `plutio_rate_limit_status` — remaining requests in the current hour.

---

## Example prompts

Once configured, try these in Claude:

- "Use Plutio to list my 10 most recent invoices by due date."
- "Find all active projects where the client is 'Acme Corp'."
- "Show me form responses from the last 7 days that haven't been converted to people yet."
- "How much billable time did I log against project ABC in March?"
- *(with writes enabled)* "Create a follow-up task on project ABC due next Monday."

### 📖 See [`examples/`](examples/) for 6 fully worked end-to-end workflows

Each example shows the user prompt, the exact tool calls Claude will make, and a realistic answer. All verified against a live workspace.

---

## Filtering syntax

List actions accept a `query` object that supports Plutio's MongoDB-style operators:

```json
{
  "action": "list",
  "query": {
    "status": "incomplete",
    "createdAt": { "$gte": "2026-01-01" },
    "$or": [
      { "tags": { "$in": ["lead", "hot"] } },
      { "companyId": "5f4..." }
    ]
  },
  "limit": 50,
  "sort": "-createdAt"
}
```

---

## Custom fields

Plutio lets you define custom fields on any resource. To set them on create/update:

```json
{
  "action": "update",
  "id": "5f4...",
  "data": {
    "customFields": [
      { "_id": "<custom_field_id>", "value": "Enterprise" }
    ]
  }
}
```

Fetch the custom-field definitions with `plutio_custom_fields` to see IDs and types.

---

## Development

```bash
# clone + install
git clone https://github.com/thecreativelabs/plutio-mcp.git
cd plutio-mcp
npm install

# dev mode (watch + reload)
npm run dev

# typecheck / build
npm run typecheck
npm run build

# run against your env
PLUTIO_CLIENT_ID=... PLUTIO_CLIENT_SECRET=... node dist/index.js
```

### Adding a new resource

All resources live in [`src/tools/registry.ts`](src/tools/registry.ts). Add a new entry and it's automatically exposed as a tool:

```ts
{
  name: "my_resource",
  path: "my-resource",
  category: "crm",
  description: "...",
  archive: true,
  bulk: true,
}
```

### Adding a specialized action

For endpoints that don't fit the CRUD pattern (e.g. sending an invoice, publishing a proposal, starting a timer), add a standalone tool file under `src/tools/` and register it in [`src/tools/index.ts`](src/tools/index.ts). See `escape-hatch.ts` for the pattern.

---

## Design choices

| Decision | Choice | Why |
|---|---|---|
| Tool granularity | **Resource-grouped** (one tool per resource with `action` param) | ~30 tools vs. 150+. Agents reason better over fewer, semantically meaningful tools. |
| Default write posture | **Read-only** | Public-safe by default; writes are an explicit opt-in. |
| Runtime | **TypeScript / Node 20+** | Lines up with MCP's primary ecosystem and enables `npx` distribution. |
| Rate limiting | **Client-side token bucket** | Respects Plutio's 1000/hr cap even when the agent goes wild. |
| Escape hatch | **`plutio_request` + `plutio_api_reference`** | Lets agents handle new endpoints without a server release. |

---

## Known limitations

**Lifecycle actions (Send Invoice, Publish Proposal, Sign Contract, Start/Stop Timer) are not supported by Plutio's public REST API.** Live probing confirmed:

- `PUT /invoices/bulk { status: "sent" }` returns HTTP 200 but silently drops the status field.
- `POST /invoices/{id}/send` and every variant returns 403.
- The Plutio web app handles these via Meteor methods over WebSocket/DDP, which is not part of the public API surface.

**Practical workarounds:**
1. Trigger lifecycle actions in the Plutio web UI, then use this server to read the resulting state.
2. If you've reverse-engineered a specialized endpoint yourself, invoke it via `plutio_request`.
3. For status-aware logic (e.g., "find all overdue invoices"), read the `status` and time fields — they're populated server-side once the Plutio app performs the transition.

If Plutio ever exposes these actions publicly, `plutio_request` will work without any server update.

## Roadmap

- [x] **Workspace introspection** — `plutio_workspace_schema` (v0.4.0)
- [x] **Transparent bulk routing** — single-record writes use `/bulk` internally (v0.3.0)
- [ ] Webhook support (once Plutio documents webhook endpoints)
- [ ] MCP resources (alongside tools) for read-heavy flows — expose `plutio://people/{id}` URIs
- [ ] Optional OpenAPI export of the generated schema
- [ ] SSE / streaming transport for hosted deployments
- [ ] Mocked-API integration test suite

Contributions welcome — see [Contributing](#contributing).

---

## Contributing

1. Fork the repo and create a feature branch.
2. `npm install && npm run typecheck` before you push.
3. Open a PR describing the problem you're solving and any API references.

Design principle: **don't grow the tool count blindly.** Before adding a tool, ask whether it can fit the existing resource-grouped pattern or belongs in `plutio_request`. The fewer tools, the better agents perform.

---

## License

MIT © TheCreativeLabs

## Disclaimer

This is an unofficial, community-maintained integration. Not affiliated with or endorsed by Plutio.
