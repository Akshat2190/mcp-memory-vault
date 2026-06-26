# Memory Vault — Persistent Context for Claude (Any Account)

A self-hosted memory layer for Claude. Your context lives as plain markdown
files (Obsidian-compatible) instead of inside any one Claude account, so
switching accounts no longer means starting over.

Tested and working: vault read/write/search, and the full MCP protocol
round-trip (`initialize`, `tools/list`, `tools/call`) over both transports
below.

---

## How it works

```
vault/*.md  (plain markdown + YAML frontmatter — open directly in Obsidian)
     ↑↓
src/vault.js          (save / get / search / list / delete)
     ↑↓
src/mcp-tools.js       (wraps vault.js as 5 MCP tools)
     ↑↓
src/stdio-server.js    src/http-server.js
(local, Claude Desktop)  (hosted, any Claude account, any device)
```

Five tools are exposed to Claude:
- `save_memory` — store a fact/decision under a topic
- `get_memory` — retrieve everything under one topic
- `search_memory` — fuzzy search across all topics
- `list_memory_topics` — overview of what's stored
- `delete_memory_topic` — remove a topic (destructive)

---

## Setup

```bash
npm install
cp .env.example .env
```

You picked "both" earlier, so here's both modes:

### Mode A — Local (Claude Desktop only, simplest)

Runs on your machine, talks to Claude Desktop over stdio. No network, no
deployment, no auth needed — Claude Desktop launches the process itself.

1. Find your Claude Desktop config file:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add this entry (use the **absolute path** to this project):

```json
{
  "mcpServers": {
    "memory-vault": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-memory-vault\\src\\stdio-server.js"],
      "env": {
        "VAULT_DIR": "C:\\path\\to\\mcp-memory-vault\\vault"
      }
    }
  }
}
```

3. Restart Claude Desktop. The tools above will be available in any
   conversation. This config is per-install of Claude Desktop, not
   per-account — so if you're logged into different accounts in the
   *same* Desktop app, this stays connected across all of them already.

### Mode B — Hosted (every account, every device, including claude.ai web)

This is the one that actually solves "switch accounts, keep context,"
since it's not tied to any single Desktop install.

**Deploy to Render (free tier):**

1. Push this folder to a GitHub repo.
2. On Render: New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `npm run start:server`
5. Add an environment variable: `MCP_SHARED_SECRET` = some long random
   string (generate one with `node -e "console.log(require('crypto').randomUUID())"`).
6. Deploy. Render gives you a URL like `https://your-app.onrender.com`.

**Connect each Claude account to it:**

1. In claude.ai (or Claude Desktop) → Settings → Connectors → Add custom
   connector.
2. URL: `https://your-app.onrender.com/mcp`
3. Add a custom header: `x-mcp-secret` = the same `MCP_SHARED_SECRET` value.
4. Save. Repeat once per account (one-time per account, as discussed —
   after that it's permanent).

**Free-tier note:** Render's free web services spin down when idle and take
~30-50s to wake on the first request after inactivity. If that's annoying,
the keep-warm trick you already know from FLUX (a cron ping every 10-14 min
via cron-job.org or UptimeRobot, hitting `/health`) fixes it.

---

## Using the Obsidian connection

`VAULT_DIR` can point anywhere — including an actual Obsidian vault folder.
If you do that, every memory Claude saves shows up as a normal markdown
note in Obsidian immediately, and anything you edit in Obsidian is
immediately what Claude reads next time. No sync step, because it's
literally the same files.

```
VAULT_DIR=/path/to/your/Obsidian/Vault/claude-memory
```

---

## Testing it works

With the server running (`npm run start:server`), from another terminal:

```bash
curl http://localhost:8080/health
```

Should return `{"ok":true,"vaultDir":"..."}`.

---

## What this does NOT do (be aware)

- Doesn't sync to ChatGPT/Gemini/Grok automatically — those need a
  different bridge (Custom GPT Action / browser extension), discussed
  separately.
- `search_memory` is fuzzy keyword search (via Fuse.js), not semantic
  vector search. Good enough for a personal vault at this scale; if it
  ever feels too literal, swapping in embeddings is a contained change
  to `vault.js` only.
- Single-writer assumption: fine for one person across many accounts,
  not built for concurrent multi-user writes.
