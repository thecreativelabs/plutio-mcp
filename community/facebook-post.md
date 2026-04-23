# Facebook community post — plutio-mcp

Three variants below. Copy and paste.

---

## 📘 Short version (~500 chars — feed posts)

🚀 **Plutio users: you can now run your workspace from Claude or ChatGPT.**

I just open-sourced `plutio-mcp`, an MCP server that connects AI assistants directly to your Plutio API. Ask *"what invoices are 60+ days overdue?"* or *"what's my MRR?"* and get answers in seconds.

✅ 40 tools covering CRM, projects, invoices, subscriptions, forms, time tracking
✅ MRR / AR aging / cashflow forecast in one call
✅ Works with Claude, ChatGPT (Pro+), Cursor, Zed, Windsurf
✅ Read-only by default · MIT · TypeScript

👉 github.com/thecreativelabs/plutio-mcp

`#Plutio #AI #Claude #ChatGPT #OpenSource`

---

## 📘 Long version (~1,500 chars — LinkedIn / detailed posts)

**Tired of clicking through Plutio to answer "quick" questions?**

I was. So I built **`@thecreativelabs/plutio-mcp`** — an open-source MCP (Model Context Protocol) server that plugs your Plutio workspace into AI assistants. Ask in plain English, get answers in seconds:

→ *"Which invoices are 60+ days overdue and by how much?"* → aged AR report in ~2 seconds.
→ *"Project cashflow forecast for Q2?"* → RRULE-expanded month-by-month projection.
→ *"Find every lead with budget over $5k from last week's form responses."* → triaged list.
→ *"Tell me everything about [client]."* → person + company + projects + invoices + subs in one shot.

**Works with:**
✅ Claude Desktop · Claude Code · Cursor · Zed · Windsurf (stdio, out of the box)
✅ **ChatGPT** (Pro / Team / Enterprise / Edu) via HTTP mode — step-by-step guide in the repo

**What's inside (v0.7.0):**

• 31 resource-group tools — CRM, projects, tasks, invoices, proposals, contracts, forms, time-entries, schedulers
• 4 analytics tools — MRR snapshot, upcoming renewals, invoice aging, cashflow forecast
• Compound client 360° lookup
• Workspace custom-field introspection so the agent sets your dropdowns correctly
• Native HTTP mode for ChatGPT + remote deployments (Fly.io, Railway, Vercel, etc.)
• OAuth2, rate limiting, read-only default, optional bearer-token auth

**Get started:**

Claude Desktop:
```
npx -y @thecreativelabs/plutio-mcp
```

ChatGPT: see examples/10-chatgpt-setup.md for the 5-minute ngrok walkthrough.

All you need is a Plutio API key from Settings → API Manager → Create Connection.

🔗 **github.com/thecreativelabs/plutio-mcp**
📦 **npm: @thecreativelabs/plutio-mcp**
📖 10 worked examples in `examples/`

MIT-licensed. Open an issue with the workflow you wish was one prompt away.

`#Plutio #AI #Claude #ChatGPT #FreelanceTools #OpenSource #Automation #MCP`

---

## 📸 Carousel variant (6 cards)

**Card 1:** "Plutio × AI. Ask your workspace anything."
**Card 2:** "40 tools. 10 worked examples. One `npx` command."
**Card 3:** "MRR in 2 seconds. AR aging in 3. Cashflow forecast in 5."
**Card 4:** "Works with Claude, ChatGPT, Cursor, Zed, Windsurf."
**Card 5:** "Open-source. MIT. Read-only by default."
**Card 6:** "github.com/thecreativelabs/plutio-mcp"

---

## 💬 Reply templates

**"Is this safe? Can it delete things?"**
> Read-only by default. You explicitly set `PLUTIO_READ_ONLY=false` to enable writes. In HTTP mode you can also require a bearer token. The Plutio REST API doesn't expose send/publish actions, so the blast radius is narrow by design.

**"Does it work with ChatGPT?"**
> Yes — ChatGPT Pro / Team / Enterprise / Edu via Developer Mode connectors. The server has native HTTP mode since v0.7.0. Full setup guide (ngrok or Fly.io) is in the repo at `examples/10-chatgpt-setup.md`.

**"Cursor? Zed? Windsurf?"**
> Out of the box via stdio. Just add to their MCP config like Claude Desktop.

**"Do I need to be a developer?"**
> Copy/paste API keys into a config. No coding. Setup takes 2 minutes for Claude/Cursor/Zed, 5 minutes for ChatGPT.

**"What's not supported?"**
> Actions Plutio handles in the web UI via WebSocket (Send Invoice, Start Timer, Publish Proposal) aren't in the public REST API. The repo is honest about where this ceiling is — you can still trigger those manually while automating everything else.

**"Can I self-host?"**
> Stdio: runs on your machine, nothing routes through a third party. HTTP: deploy anywhere that runs Node 20+. Source is public — audit before you trust it.
