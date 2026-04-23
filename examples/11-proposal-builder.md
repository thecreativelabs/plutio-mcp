# 11 — Automated proposal builder with presets & block templates

Turn a scoping conversation into a ready-to-send Plutio proposal in one tool call.

Requires `PLUTIO_READ_ONLY=false`.

## The three tools

- **`plutio_list_proposal_presets`** — see what presets ship with the server (v0.8.0 includes 5: `web-design`, `seo-services`, `consulting`, `creative-services`, `coaching`).
- **`plutio_proposal_from_preset`** — creates a fully-populated proposal in Plutio from a preset, with all billable items and blocks in the correct order.
- **`plutio_analyze_proposal`** — introspects one of your existing proposals (block order, types, line-item spread) so you can mirror the structure for a new client.

## Prompt

> Create a web design proposal for Alice Example ($25k range). Use our SEO service pricing structure as a model — pull the block types from our best-performing SEO proposal.

## What Claude will do

1. **`plutio_analyze_proposal`** to borrow structure from a successful past proposal:
    ```json
    { "name": "SEO Proposal — Acme Corp 2025" }
    ```
    → returns block types in order, line-item titles, pricing tiers.

2. **`plutio_people`** `list` with `{"name.first":"Alice","name.last":"Example"}` → get the clientId.

3. **`plutio_proposal_from_preset`** to instantiate:
    ```json
    {
      "preset": "web-design",
      "clientId": "person_abc123",
      "name": "Website redesign — Alice Example",
      "overrides": {
        "billableItems": [
          { "title": "Discovery", "amount": 4000, "quantity": 1, "descriptionHTML": "<p>...</p>" },
          { "title": "Design", "amount": 8000, "quantity": 1, "descriptionHTML": "<p>...</p>" },
          { "title": "Development", "amount": 11000, "quantity": 1, "descriptionHTML": "<p>...</p>" },
          { "title": "Launch & training", "amount": 2000, "quantity": 1, "descriptionHTML": "<p>...</p>" }
        ]
      }
    }
    ```

## Example answer

```
Created proposal: Website redesign — Alice Example
  _id: proposal_xyz789
  currency: USD
  billable items: 4 (total $25,000)
  blocks: 8 (intro, content, content, items, fees, content, content, signature)

Open in Plutio → Proposals → "Website redesign — Alice Example" to review
and send. Note: the Plutio REST API doesn't expose a send endpoint —
you'll hit the Send button in the UI.
```

## Behind the scenes

Plutio doesn't let you copy a template body over REST — the `GET /proposals/{template_id}` endpoint is blocked. So this server **builds proposals from scratch** using preset scaffolds stored as JSON in [`src/presets/proposals/`](../src/presets/proposals). Each preset defines billable items and an ordered list of blocks (intro, content paragraphs, items placeholder, fees placeholder, signature).

The tool handles the multi-step Plutio flow transparently:

1. `POST /proposals` with `name`, `currency`, `client`, `billableItems` (Plutio auto-creates 3 default blocks).
2. Deletes the auto-generated blocks.
3. For each preset block, `POST /blocks` with the correct schema per type:
   - `intro` → `main.textHTML` wrapper (Plutio convention).
   - `content` → top-level `textHTML`.
   - `items` / `fees` / `signature` → structural, no content payload.
4. `PUT /proposals/bulk` to set the `blocks` array in the preset's order.

## Customizing presets

The shipped presets are starting points, not your final voice. Three ways to make them yours:

### A — Edit in place
Fork the repo, edit `src/presets/proposals/*.json`, rebuild. Blocks and line items are human-readable HTML and plain numbers.

### B — Override at call time
Pass `overrides.billableItems` or `overrides.blocks` to replace either list entirely:

```json
{
  "preset": "consulting",
  "clientId": "...",
  "overrides": {
    "blocks": [
      { "type": "intro", "textHTML": "<h1>Custom intro</h1><p>...</p>" },
      { "type": "content", "textHTML": "<h2>My approach</h2><p>...</p>" },
      { "type": "items" },
      { "type": "fees" },
      { "type": "signature" }
    ]
  }
}
```

### C — Analyze + mirror
Run `plutio_analyze_proposal` on your favorite past proposal. Feed the resulting `structure.blockOrder` back into `plutio_proposal_from_preset` as the `overrides.blocks` types, then let the agent generate fresh text for each block.

## What this does NOT do

- **Cannot fetch your existing Plutio template content** — REST API doesn't expose template bodies. The "templates" you see in Plutio are browsable (`plutio_templates` list) but not readable via REST. This builder generates from scratch instead.
- **Cannot send/publish the proposal** — send/publish actions live in the web UI only. Review in Plutio → click Send.
- **Doesn't support attachments or images** in blocks yet (the `image`, `video`, `canvas`, `html` block types have their own schemas — v0.9.0 roadmap).

## Tips

- Always resolve the client ID first (via `plutio_people` or `plutio_client_360`) so the proposal is correctly linked.
- Pair with `plutio_workspace_schema` if you want the proposal to set custom fields at the same time.
- For a consistent "voice" across proposals, keep the blocks in your preset JSON and only override billable items at call time.
