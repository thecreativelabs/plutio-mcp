# 13 — Extracting your existing Plutio templates into reusable presets

Plutio's REST API doesn't let you UPDATE template content (that's web-UI only — see [examples/12](12-contract-builder.md)). But it DOES let you READ template content. `plutio_template_to_preset` reads any of your existing contract or proposal templates and emits a preset JSON ready to drop into the repo. Then every future contract/proposal you generate via AI uses your real, lawyer-vetted prose — not generic placeholders.

**Run once per template, save the JSON, never think about it again.**

## Quick start

### Prompt

> Extract my "Master Services Agreement" Plutio contract template into a preset and save it to disk.

### What Claude will do

```json
{
  "tool": "plutio_template_to_preset",
  "arguments": {
    "templateName": "master services",
    "entityType": "contract",
    "writeToDisk": true
  }
}
```

### Example answer

```
template: MASTER SERVICES AGREEMENT
  body id: template_body_abc123
  block type distribution: { content: 1, signature: 1 }
  preset slug: master-services-agreement
  blocks extracted: 2

Saved to: src/presets/contracts/master-services-agreement.json

Use it: plutio_contract_from_preset({
  preset: "master-services-agreement",
  clientId: "person_abc123"
})
```

## How it works

1. Looks up the Plutio template metadata (`/templates`) by name or ID.
2. Reads the template's body record (`/contracts` or `/proposals` with `isTemplate: true` filter — Plutio hides these from the default list).
3. Pulls every block belonging to that body in canonical order (`/blocks` with the same `isTemplate: true` filter).
4. For each block, captures `type` + `textHTML` (or `main.textHTML` for `intro` blocks).
5. For proposal templates: also captures `billableItems` + `currency`.
6. Optionally rewrites `[CLIENT NAME]`, `<<DATE>>`, `[[TERM]]` etc. into `{{ snake_case }}` variables.
7. Returns the preset JSON. With `writeToDisk: true`, also saves it to `src/presets/{type}s/<slug>.json`.

## Plutio's native variables — already supported

If your template uses Plutio's built-in tokens like `{{ business.name }}`, `{{ client.name }}`, `{{ client.address }}`, they pass through into the preset unchanged. Plutio substitutes them server-side when the new contract is rendered, so the preset works for **any client** — not just the one you happened to be looking at when you extracted it.

## Bulk-extracting all your templates at once

Once for each template:

```
For each contract template — call plutio_template_to_preset with writeToDisk: true.
```

Or just ask Claude to do it:

> List all my contract templates, then extract each one to a preset on disk.

## Customizing after extraction

Open the generated JSON at `src/presets/contracts/<slug>.json`:

```json
{
  "slug": "master-services-agreement",
  "displayName": "Master Services Agreement",
  "description": "Extracted from Plutio template ... on 2026-04-28.",
  "blocks": [
    {
      "type": "content",
      "textHTML": "<h3>Your agreement title here</h3>..."
    },
    { "type": "signature" }
  ]
}
```

Edit the HTML to taste — change pricing language, add new clauses, parameterize anything you want with `{{ my_var }}` tokens. From that point forward `plutio_contract_from_preset` reads your edits.

## Re-extracting after Plutio-side changes

If you update a template in Plutio's web UI and want the preset to reflect the new content, re-run the extraction with the same `slug` and `writeToDisk: true`. The preset file is overwritten with the latest.

## What this does NOT do

- **Does not edit the original Plutio template.** Reads only. If you want the contract you generate from a preset to differ from the Plutio original, edit the JSON file in this repo, not Plutio.
- **Does not auto-detect Plutio's `{{ object.field }}` tokens** (those don't need detection — they pass through and Plutio renders them).
- **Does not extract images, signatures with stored data, or attachments** — only block types and their HTML/text content. Image blocks get an empty placeholder you can swap later.

## Combining tools

A common one-shot workflow for a new client:

1. **Extract** (one-time, per template): `plutio_template_to_preset` for each of your 9 contract templates → 9 preset JSONs in the repo.
2. **Discovery**: `plutio_client_360 { name: "Acme Corp" }` to confirm the client record.
3. **Generate**: `plutio_contract_from_preset { preset: "standard-agreement-for-web-design-services", clientId: "..." }`.
4. **Review + send** in Plutio's UI (REST API doesn't expose the signature flow).

After step 1 (the one-time setup), step 3 runs in seconds for any client.
