# 02 — Aged unpaid-invoice report

The "send to accounts receivable on Monday morning" report.

## Prompt

> Show me every unpaid invoice older than 30 days, grouped by how overdue they are. Include client, amount, and due date.

## What Claude will do

1. **`plutio_invoices`** with:
    ```json
    {
      "action": "list",
      "query": {
        "status": {"$ne": "paid"},
        "dueDate": {"$lt": "<today-30d as ISO>"}
      },
      "limit": 100,
      "sort": "dueDate"
    }
    ```
2. For each invoice, resolve `client._id` → **`plutio_people`** `get`.
3. Group by age bucket (`30–60 days`, `60–90 days`, `90+ days`) and format a markdown table.

## Example answer

```
90+ days overdue (3 invoices, $12,450 total)
  INV-1003   $4,200   Acme Corp      due 2026-01-12 (101d)
  INV-1008   $5,250   Example Design Co  due 2026-01-18 ( 95d)
  INV-1011   $3,000   Example LLC       due 2026-01-30 ( 83d)

60–90 days overdue (2, $1,850 total)
  INV-1019   $1,350   Acme Corp      due 2026-02-11 ( 71d)
  INV-1022   $  500   Sample Co       due 2026-02-20 ( 62d)

30–60 days overdue (4, $7,025 total)
  ...
```

## Why this works

Plutio's filter supports `$ne`, `$lt`, `$gt`, etc. on any field. `dueDate` is stored as ISO 8601, so string comparison works. Sorting on `dueDate` means oldest-first naturally.

## Going further

Turn this into a cron. Add a follow-up step that drafts a dunning email via `plutio_conversations` create for each invoice in the 60+ bucket.
