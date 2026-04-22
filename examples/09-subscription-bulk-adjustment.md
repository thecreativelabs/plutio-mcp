# 09 — Bulk-adjust subscription amounts (pricing changes)

For raising prices across a cohort. Plutio's REST API accepts `amount` and `repeat` mutations on subscriptions, so this works end-to-end. Requires `PLUTIO_READ_ONLY=false`.

## Prompt

> Raise the amount on every annual subscription by 5%, rounded to the nearest dollar. Show me the before/after table before you commit — I want to approve.

## What Claude will do

1. **`plutio_invoice_subscriptions`** list with `{"status": "active", "repeat.intervalType": "year"}`.
2. Compute `newAmount = Math.round(amount * 1.05)`.
3. Present the table to the user for approval.
4. On approval: **`plutio_invoice_subscriptions`** `bulk_update` per sub (or loop single `update` if `bulk_update` expects uniform data — see note below).

## Example answer (preview)

```
Before committing a 5% increase on 5 annual subscriptions:

                                 CURRENT    NEW      ∆
Acme Corp — Dom Renewal   $360  → $441    +$20.85
Acme Corp — Hosting       $500  → $650    +$30.84
Bluehat LLC — Annual Retainer  $2,400.00  → $2,520  +$120.00
Acme Widgets — SSL/Hosting       $180.00  → $189    +$9.00
Vela Collective — Tools         $1,200.00 → $1,260  +$60.00

Total annual lift: +$240.69
Proceed? (yes/no)
```

## The actual write (after user says yes)

```json
{
  "action": "update",
  "id": "<sub_id>",
  "data": { "amount": 441 }
}
```

The server transparently routes each `update` through `PUT /invoice-subscriptions/bulk` with `{_ids: [id], amount: 441}` — see [v0.3.0 release notes](https://github.com/thecreativelabs/plutio-mcp/releases/tag/v0.3.0) for why.

## What you CANNOT do via REST (Plutio limitation)

- Cannot pause/resume/cancel a subscription — `status` field mutations are silently dropped.
- Cannot trigger an ad-hoc charge.
- These actions live in the web UI only.

## Why this example matters

Pricing adjustments are a classic quarterly finance task. Without this workflow, someone manually edits each subscription in the Plutio UI. With the MCP server, it's one prompt and one approval click — and the preview step keeps a human in the loop for a financial change.
