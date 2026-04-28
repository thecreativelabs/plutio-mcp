# 14 — Configure Custom Pages and Custom Fields via API

Two related Plutio settings surfaces become programmable in v0.10.2:

- **Custom Pages** (Settings → Custom Pages → role) — add new pages to any role's dashboard with structured content blocks.
- **Custom Fields** (Settings → Custom Fields) — add curated bundles of fields in one call.

## What's possible (and what isn't)

| Operation | Custom Pages | Custom Fields |
|---|---|---|
| List existing | ✅ via `plutio_dashboards` and `plutio_dashboard_pages` | ✅ via `plutio_custom_fields` |
| Read existing | ✅ | ✅ |
| Create new | ✅ via `plutio_create_dashboard_page_from_preset` | ✅ via `plutio_apply_custom_fields_bundle` |
| Update existing | ❌ Plutio REST returns 403 — manage in web UI | ❌ Plutio REST returns 403 — manage in web UI |
| Delete existing | ❌ Same | ❌ Same |
| Set values on records | n/a | ✅ via `customFields: [{_id, value}]` on record create/update |

The two-step pattern Plutio enforces: **create everything you need at the start; manage existing config in the web UI.** This server's tools fit that pattern.

---

## Custom Fields workflow

### Prompt

> Set up our standard lead-intake fields (lead source, budget, status, etc.) on Person records.

### What Claude will do

1. **`plutio_list_custom_fields_bundles`** → discovers shipped bundles.
2. **`plutio_apply_custom_fields_bundle({ bundle: "lead-intake" })`** → creates the 5 fields. Skips any that already exist (matched by entityType + title, case-insensitive).

### Example answer

```
Applied bundle: lead-intake
  attempted: 5
  created: 5 (Lead Source, Budget Range, Lead Status, First Contact Date, Lead Notes)
  skipped: 0
  errored: 0

⚠️ Custom fields can't be edited or deleted via REST. To rename or remove,
   use Plutio's web UI: Settings → Custom Fields.
```

### Shipped bundles

| Slug | Fields | Entity |
|---|---|---|
| `lead-intake` | Lead Source, Budget Range, Lead Status, First Contact Date, Lead Notes | person |
| `client-onboarding` | Onboarding Stage, NDA Signed, Welcome Pack Sent, Project Start Date, Primary Point of Contact, Account Tier | person + company |

### Custom bundle on the fly

You can pass `fields` directly without a preset:

```json
{
  "fields": [
    {
      "entityType": "project",
      "inputType": "select",
      "title": "Project Phase",
      "options": [
        { "name": "Discovery" },
        { "name": "Design" },
        { "name": "Build" },
        { "name": "QA" },
        { "name": "Launch" }
      ]
    },
    {
      "entityType": "project",
      "inputType": "currency",
      "title": "Allocated Budget"
    }
  ]
}
```

### Adding your own bundles

Drop a JSON file into `$PLUTIO_USER_PRESETS_DIR/custom-fields/<slug>.json` with this shape:

```json
{
  "slug": "your-bundle",
  "displayName": "Your bundle",
  "description": "...",
  "fields": [{ "entityType": "person", "inputType": "text", "title": "..." }]
}
```

User bundles load alongside built-ins.

---

## Custom Pages workflow

### Prompt

> Add a "Welcome" page to our Client portal with the welcome preset.

### What Claude will do

1. **`plutio_dashboards`** list → find the dashboard titled "Client" (returns `_id`).
2. **`plutio_list_dashboard_page_presets`** → see what page scaffolds are available.
3. **`plutio_create_dashboard_page_from_preset({ preset: "client-welcome", dashboardId: "<from step 1>" })`** → creates the page + populates content blocks.

### Example answer

```
✓ Page created
  _id: page_abc123
  dashboard: Client
  preset: client-welcome
  blocks: 4 (welcome message, what to expect, onboarding checklist, how to reach us)

Open Plutio → Settings → Custom Pages → Client → "Client welcome page"
to review and customize.
```

### Shipped page presets

| Slug | Blocks | Purpose |
|---|---|---|
| `client-welcome` | 4 | Personalized landing for new clients (intro, expectations, onboarding checklist, contact) |
| `project-status` | 5 | Always-current project snapshot (phase, this week's focus, blockers, deliverables) |

### Variable rendering

Plutio's native tokens work out of the box — no extraction needed:

- `{{ client.name }}` — current client viewing the page
- `{{ business.name }}` — your workspace
- `{{ business.owner.name }}` — your name
- `{{ project.name }}` — current project (where context permits)

These render server-side, so one preset works for all your clients.

### Adding your own page presets

Drop into `$PLUTIO_USER_PRESETS_DIR/dashboard-pages/<slug>.json`:

```json
{
  "slug": "your-page",
  "displayName": "Your page name",
  "description": "...",
  "blocks": [
    { "type": "content", "textHTML": "<h1>Hello</h1>..." }
  ]
}
```

Block types allowed for dashboard pages: `content`, `image`, `canvas`, `video`, `html`. (No `intro`, `items`, `fees`, or `signature` — those are for proposals/contracts.)

---

## Combined workflow — new client onboarding in one prompt

> Onboard a new client: company is "Globex Inc.", primary contact is Jane Doe (jane@globex.example.com). Apply our client-onboarding fields, then create a personalized welcome page on the Client dashboard.

What Claude will do (in sequence):

1. `plutio_companies create { title: "Globex Inc." }`
2. `plutio_people create { name: { first: "Jane", last: "Doe" }, role: "client", companies: [{_id: "..."}] }`
3. `plutio_apply_custom_fields_bundle { bundle: "client-onboarding", skipExisting: true }`
4. `plutio_dashboards list` → find Client dashboard `_id`
5. `plutio_create_dashboard_page_from_preset { preset: "client-welcome", dashboardId: "...", title: "Welcome, Globex Inc." }`

End state: Globex is set up, the workspace has the onboarding-fields installed (skipped if they already existed from a previous run), and the Client portal has a personalized welcome page rendered with `{{ client.name }}` → "Globex Inc."

Manual remaining steps in Plutio UI:
- Set the new custom field values on Jane's contact record (`Onboarding Stage = "Welcome sent"`, `Account Tier = ...`)
- Customize the welcome page text per relationship if needed
