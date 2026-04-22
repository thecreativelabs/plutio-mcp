# 06 — Escape hatch: calling Plutio endpoints that don't have a tool

Not every Plutio endpoint fits the resource-grouped tool model. Specialized endpoints (send invoice, publish proposal, start timer, etc.) often aren't publicly documented. Use `plutio_request` when you've discovered an endpoint yourself — either from browser DevTools, the Plutio changelog, or another integration.

## Prompt

> Via `plutio_request`, POST to `/invoices/invoice_abc123/send` with an empty body and tell me what happens.

## What Claude will do

```json
{
  "tool": "plutio_request",
  "arguments": {
    "method": "POST",
    "path": "/invoices/invoice_abc123/send",
    "body": {}
  }
}
```

## Example answer

```
HTTP 403 — the endpoint does not exist at this path/method combination
(Plutio returns 403 "Method not allowed" for any unknown route).
The official API doesn't expose a direct "send invoice" endpoint;
the action happens via the web UI. See docs.plutio.com or network-tab
inspection to find specialized endpoints.
```

## When this tool shines

- A new Plutio API feature is released but this MCP server hasn't added a first-class tool yet.
- You're building a custom workflow that queries multiple resources and wants a single round-trip.
- You've reverse-engineered a specialized endpoint and want to use it immediately.

## Safety

In read-only mode (default), only GET is exposed. Set `PLUTIO_READ_ONLY=false` to enable POST/PUT/DELETE/PATCH. The tool description makes this clear to the agent — it won't attempt mutations in read-only mode.

## Rate limiting

Rate-limited like all other tools (token bucket, 1000 req/hr by default). Check your budget with `plutio_rate_limit_status` before kicking off bulk `plutio_request` sequences.
