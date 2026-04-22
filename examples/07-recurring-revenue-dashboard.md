# 07 — Recurring revenue dashboard (MRR / ARR)

Turn your invoice subscriptions into a live MRR/ARR snapshot in one prompt.

## Prompt

> Give me a recurring revenue dashboard. Group my active subscriptions by billing frequency, show the normalized monthly value of each group, total MRR, and implied ARR.

## What Claude will do

1. **`plutio_invoice_subscriptions`** with `action: list`, `query: {"status": "active"}`, `limit: 200`.
2. For each, inspect `repeat: {intervalType, interval, rrule}` + `amount`.
3. Normalize to monthly:
   - `intervalType=month`, `interval=1` → `amount / 1`
   - `intervalType=month`, `interval=3` → `amount / 3` (quarterly)
   - `intervalType=year`, `interval=1` → `amount / 12`
   - `intervalType=week`, `interval=1` → `amount * 4.33`
4. Group by frequency label and sum.

## Example answer

```
Active subscriptions: 27
Total MRR: $8,420.17     ARR (MRR × 12): $101,042.04

By billing frequency:
  Monthly      18 subs   $4,850.00 MRR   (57% of revenue)
  Quarterly     3 subs   $1,275.00 MRR
  Annually      5 subs   $2,205.17 MRR   (largest: Acme Corp $360/yr ≈ $35/mo)
  Semi-annual   1 sub      $90.00 MRR
```

## Why this works

`intervalType` + `interval` + `amount` are all present in the list response for subscriptions. The `rrule` field gives you an RFC 5545 recurrence rule if you want to do more advanced frequency math.

## Note on subscriptions and REST

`plutio_invoice_subscriptions` only supports `list` (not `get` by id — the Plutio REST API blocks that). The server's schema reflects this: the `get` action is not offered for subscriptions. Always pass a filter to narrow the list.
