# 10 — Using plutio-mcp from ChatGPT

Works out of the box for Claude / Cursor / Zed via stdio. For **ChatGPT** you need an HTTP server + public URL, because ChatGPT only connects to remote MCP endpoints.

As of v0.7.0 the server speaks HTTP natively. You just need to expose it.

## Requirements

- **ChatGPT Pro, Team, Enterprise, or Edu** (Free plan doesn't expose MCP connectors).
- Node 20+ locally, or any host that runs Node.
- Your Plutio API credentials (Settings → API Manager → Create Connection).

---

## Local route (fastest — ~5 minutes)

Uses your laptop + ngrok for a public URL. Zero hosting bill. ngrok's free tier is fine for individual use.

### 1. Pick an auth token (any random string)

```bash
export PLUTIO_MCP_AUTH_TOKEN=$(openssl rand -hex 24)
echo "Your token: $PLUTIO_MCP_AUTH_TOKEN"
```

Save this — you'll paste it into ChatGPT.

### 2. Run the server in HTTP mode

```bash
PLUTIO_CLIENT_ID=your_id \
PLUTIO_CLIENT_SECRET=your_secret \
PLUTIO_BUSINESS=your_workspace_slug \
PLUTIO_READ_ONLY=true \
PLUTIO_MCP_HTTP=true \
PLUTIO_MCP_HTTP_HOST=0.0.0.0 \
PLUTIO_MCP_HTTP_PORT=8080 \
PLUTIO_MCP_AUTH_TOKEN=$PLUTIO_MCP_AUTH_TOKEN \
npx -y @thecreativelabs/plutio-mcp
```

You should see:

```
plutio-mcp HTTP listening on http://0.0.0.0:8080
  POST /mcp     — MCP Streamable HTTP
  GET  /sse     — MCP SSE alias
  GET  /health  — health check
  auth: Bearer token required
```

Leave it running.

### 3. Expose it via ngrok (second terminal)

```bash
ngrok http 8080
```

ngrok prints a public URL like `https://abc123.ngrok-free.app`. Copy it.

### 4. Add as a ChatGPT connector

1. Open ChatGPT → **Settings → Connectors**
2. Scroll to **Advanced settings → enable Developer Mode**
3. Back in **Connectors**, click **Create** (top-right)
4. Fill in:
   - **Name:** `Plutio`
   - **Description:** *(optional)* "My Plutio workspace — CRM, invoices, subs"
   - **MCP server URL:** `https://abc123.ngrok-free.app/mcp`
   - **Authentication:** **Custom headers** → add header:
     - **Name:** `Authorization`
     - **Value:** `Bearer <your token from step 1>`
   - Acknowledge the "I understand the risks" checkbox
5. Click **Create**

### 5. Use it in a chat

1. New chat → click the **+** (or Tools) icon in the prompt bar
2. Turn on **Developer Mode → Plutio**
3. Ask: *"Use Plutio to show me my MRR snapshot"* — ChatGPT will call `plutio_mrr_snapshot` and answer.

### Daily flow once set up

- Start server (terminal 1) and ngrok (terminal 2) when you want to use it.
- Paste the fresh ngrok URL into ChatGPT settings if it rotated (paid ngrok has reserved URLs to avoid this).
- Ctrl-C both when done.

---

## Hosted route (always on — ~15 minutes)

If you want plutio-mcp to be available 24/7 without keeping your laptop on, deploy to a small always-on host. Any of these work:

- **Fly.io** — free tier sufficient
- **Railway** — free/cheap
- **Cloudflare Workers** — needs the Web-Standard transport build, slightly more setup
- **Your own VPS**

### Fly.io quick-start

```bash
# Create a directory for the deployment
mkdir plutio-mcp-deploy && cd plutio-mcp-deploy

# Minimal Dockerfile
cat > Dockerfile <<'EOF'
FROM node:22-alpine
WORKDIR /app
RUN npm install -g @thecreativelabs/plutio-mcp
EXPOSE 8080
CMD ["plutio-mcp"]
EOF

# Deploy
flyctl launch --no-deploy
flyctl secrets set \
  PLUTIO_CLIENT_ID=... \
  PLUTIO_CLIENT_SECRET=... \
  PLUTIO_BUSINESS=... \
  PLUTIO_MCP_HTTP=true \
  PLUTIO_MCP_HTTP_HOST=0.0.0.0 \
  PLUTIO_MCP_HTTP_PORT=8080 \
  PLUTIO_READ_ONLY=true \
  PLUTIO_MCP_AUTH_TOKEN=$(openssl rand -hex 24)
flyctl deploy
```

Note the public URL Fly prints. Plug it into ChatGPT exactly like step 4 above.

---

## Security

- **Always set `PLUTIO_MCP_AUTH_TOKEN`** when exposing publicly. Otherwise the entire internet can list your invoices.
- Keep `PLUTIO_READ_ONLY=true` unless you explicitly need writes. Once writes are on, a leaked token can modify real records.
- Store secrets via the host's secret manager (Fly secrets, Railway env, Vercel env), never commit them.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| ChatGPT: "Failed to connect" | ngrok URL expired — restart ngrok and update the connector URL. |
| 401 on every request | Token mismatch. Compare `PLUTIO_MCP_AUTH_TOKEN` on server vs. Authorization header in ChatGPT. |
| ChatGPT doesn't see the connector | Developer Mode not enabled, or you didn't toggle it on in *this* chat. |
| Server crashes on startup | Usually missing `PLUTIO_CLIENT_ID`/`PLUTIO_CLIENT_SECRET`. Check the stderr log. |
| Tools never called | Ensure your prompt explicitly references "Plutio" — ChatGPT's agent needs the hint. |
