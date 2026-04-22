# 08 — Upcoming renewals in the next 30 days

For finance teams: "what's going to bill soon?" Also great before a pricing change — know who's up for renewal.

## Prompt

> List every subscription that will issue its next invoice in the next 30 days. Include client, amount, and the exact upcoming invoice date. Sort by date.

## What Claude will do

1. **`plutio_invoice_subscriptions`** list with:
    ```json
    {
      "action": "list",
      "query": {
        "status": "active",
        "upcomingInvoiceDate": {
          "$gte": "<today ISO>",
          "$lt":  "<today+30d ISO>"
        }
      },
      "sort": "upcomingInvoiceDate",
      "limit": 200
    }
    ```
2. For each, optionally **`plutio_people`** get on `client._id` to show client names instead of IDs.

## Example answer

```
Upcoming renewals (next 30 days): 6 subs · $3,360 total

Apr 25  Acme Corp (Dom Ren.)      $360   annual
Apr 28  Bluehat LLC                      $250.00   monthly retainer
May  3  Acme Widgets — Hosting           $180.00   monthly
May 12  Northside Design                 $1,500.00 quarterly
May 15  Greenhaus Co                     $250.00   monthly
May 19  Vela Collective                  $820.00   monthly retainer
```

## Why this works

`upcomingInvoiceDate` is populated server-side based on `startDate` + `repeat` and is always accurate. `$gte` + `$lt` on ISO date strings works cleanly in Plutio's MongoDB-style filter.

## Extending

- Add a column showing the last charge attempt result: `lastChargeAttemptedAt` and its outcome.
- Wire this into a scheduled weekly email via Claude's scheduling tool or a simple cron.
- Chain with `plutio_transactions` list to cross-reference: "did the April 25 charge succeed?"

## Why `get` by id isn't used

The Plutio REST API returns 403 for `GET /invoice-subscriptions/{id}`. The server's schema therefore doesn't offer a `get` action for this resource — `list` with a filter is the only read path. This is documented in [plutio_api_reference](https://github.com/thecreativelabs/plutio-mcp#escape-hatches).
