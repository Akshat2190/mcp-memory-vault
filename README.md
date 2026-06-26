# 📦 Memory Vault — Persistent Context Layer for Claude (MCP)

Memory Vault is a self-hosted, local-first memory engine for Claude. Your context lives as human-readable Markdown files in an Obsidian-compatible vault on your machine, or you can back it with MongoDB Atlas for cloud persistence. The goal is simple: keep your engineering context portable across accounts, devices, and client surfaces without locking it to a single AI vendor.

Built on Anthropic's Model Context Protocol (MCP).

## Features

- Zero account lock-in: keep the same context across personal or corporate Claude accounts.
- Obsidian native: memories are plain Markdown files, so they show up directly in Obsidian.
- MongoDB Atlas integration: optionally sync or back up memory data in the cloud.
- Dual transports: run locally over `stdio` for Claude Desktop or over HTTP for broader access.
- Privacy first: no tracking telemetry; you own the vault and any cloud keys you configure.

## Architecture

```mermaid
flowchart TB
   client[Claude Desktop / Browser Client] -->|MCP Protocol| server[Memory Vault Server (Node)]
   server -->|Local file I/O| vault[Obsidian Vault\n(Plain Markdown Notes)]
   server -->|Cloud sync| atlas[MongoDB Atlas\n(Persistent datastore)]
```

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/mcp-memory-vault.git
cd mcp-memory-vault
npm install
npm link
memory-vault-setup
```

The setup wizard detects your operating system, locates the local Claude Desktop configuration, and injects the MCP server entry for you.

## Configuration

Copy the template file and edit the values for your environment:

```bash
cp .env.example .env
```

Example configuration:

```env
VAULT_DIR=/path/to/your/Obsidian/Vault/claude-memory
PORT=8080
MCP_SHARED_SECRET=your-secure-random-string
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/memory_vault?retryWrites=true&w=majority
```

Use `VAULT_DIR` for the local Markdown vault, `PORT` for the HTTP server, `MCP_SHARED_SECRET` for connector access, and `MONGODB_URI` if you want MongoDB-backed storage.

## Tool Surface

The server exposes five MCP tools:

| Tool | Parameters | Purpose |
| --- | --- | --- |
| `save_memory` | `topic`, `content`, `tags` | Save a memory or decision into the persistent vault. |
| `get_memory` | `topic` | Retrieve everything stored under a topic. |
| `search_memory` | `query`, `topic`, `limit` | Search memories with optional topic scoping. |
| `list_memory_topics` | None | List all stored topics and their metadata. |
| `delete_memory_topic` | `topic` | Delete an entire topic from the vault. |

## Claude Desktop Setup

The included setup script writes the Claude Desktop MCP configuration for you.

```bash
memory-vault-setup
```

If you prefer to configure it manually, the server entry points to `src/stdio-server.js` and passes `VAULT_DIR` through the environment.

## Hosted HTTP Deployment

To expose the vault over HTTP for Claude web or other remote clients:

1. Push the repository to GitHub.
2. Deploy it as a web service on Render.
3. Use `npm install` as the build command and `npm run start:server` as the start command.
4. Set `MCP_SHARED_SECRET` and `MONGODB_URI` in the Render environment settings.
5. Add a custom connector in Claude and point it at your deployment URL.

Example connector URL:

```text
https://your-app.onrender.com/mcp?secret=YOUR_MCP_SHARED_SECRET_HERE
```

## License

MIT © 2026 Akshat