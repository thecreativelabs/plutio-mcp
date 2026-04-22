# Facebook community post — plutio-mcp v0.6.0

Copy below and post to the Plutio community group / Plutio Facebook page / freelancer-automation groups.

---

## Short version (~500 chars — for most feeds)

🚀 **Plutio users: you can now run your workspace from Claude (or any AI).**

I just open-sourced `plutio-mcp`, an MCP server that connects Claude directly to your Plutio API. Ask questions like *"which invoices are 60+ days overdue?"* or *"what's my MRR by billing frequency?"* and get answers in seconds — no spreadsheet gymnastics.

✅ 40 tools covering CRM, projects, invoices, subscriptions, forms, time tracking
✅ MRR / AR aging / cashflow forecast as one-shot reports
✅ Read-only by default — flip a switch to enable writes
✅ MIT-licensed, TypeScript, `npx` one-liner

👉 [github.com/thecreativelabs/plutio-mcp](https://github.com/thecreativelabs/plutio-mcp)

Feedback welcome.

---

## Long version (~1,500 chars — for detailed posts / LinkedIn)

**Tired of clicking through Plutio to answer "quick" questions?**

I was. So I built **`@thecreativelabs/plutio-mcp`** — an open-source MCP (Model Context Protocol) server that lets Claude, Cursor, Zed, and any other MCP client talk to your Plutio workspace natively.

One prompt, one answer:

- *"Which invoices are 60+ days overdue and by how much?"* → aged AR report in ~2s.
- *"Project cashflow forecast for Q2?"* → RRULE-expanded projection across all active subs.
- *"Find every lead with budget > $5k from last week's form responses."* → triaged list.
- *"Tell me everything about [client name]."* → person + company + projects + invoices + subs in one shot.

**What's in it (v0.6.0):**

- 31 resource-group tools (people, companies, projects, tasks, invoices, proposals, contracts, forms, time-entries, schedulers, etc.)
- 4 analytics tools (MRR snapshot, upcoming renewals, invoice aging, cashflow forecast)
- 1 compound lookup (client 360°)
- Workspace custom-field introspection so the agent sets your dropdowns correctly
- OAuth2, built-in rate limiting, read-only default
- Verified against a live 353-invoice / 27-sub workspace

**How to use it:**

```bash
npx -y @thecreativelabs/plutio-mcp
```

Add it to Claude Desktop or Claude Code in ~2 minutes. All you need is a Plutio API key (Settings → API Manager → Create Connection).

🔗 Repo + docs: **github.com/thecreativelabs/plutio-mcp**
📦 npm: **@thecreativelabs/plutio-mcp**
📖 9 worked examples in the `examples/` folder

MIT-licensed. Community contributions very welcome — open an issue with the workflow you wish was one prompt away.

---

## Visual callouts (for carousel / quote-card format)

**Card 1:** "Plutio × Claude. Ask your workspace anything."
**Card 2:** "40 tools. 9 worked examples. One `npx` command."
**Card 3:** "MRR in 2 seconds. AR aging in 3."
**Card 4:** "Open-source. MIT. Verified live."
**Card 5:** "github.com/thecreativelabs/plutio-mcp"

---

## Suggested hashtags

`#Plutio #AI #Claude #FreelanceTools #OpenSource #Automation #MCP #ModelContextProtocol #CreativeLabs #FreelancerLife #SmallBusinessTech`

---

## Reply-template for common questions

**"Is this safe? Can it delete things?"**
> Read-only by default. You explicitly set `PLUTIO_READ_ONLY=false` to enable writes. The REST API Plutio exposes doesn't even allow send/publish actions via the API, so the blast radius is narrow.

**"Does it work with ChatGPT / Cursor / Zed?"**
> Yes — it speaks standard MCP. Any client that supports MCP can use it.

**"Do I need to be a developer?"**
> If you can paste an OAuth key into a config file, you're good. No coding required.

**"What's not supported?"**
> Actions Plutio handles in the web UI via WebSocket (Send Invoice, Start Timer, Publish Proposal) — those aren't in the public REST API. The repo is honest about where this ceiling is.

**"Can I self-host?"**
> It runs on your machine (stdio transport) — nothing routes through us. Source is public, audit it before you trust it.
