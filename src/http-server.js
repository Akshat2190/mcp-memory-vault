import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerMemoryTools } from "./mcp-tools.js";
import { VAULT_DIR } from "./vault.js";

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.MCP_SHARED_SECRET || null;

const app = express();
app.use(express.json());

// Simple shared-secret auth so randos on the internet can't read/write your
// vault. Claude's connector settings let you set a custom header per
// connector — set MCP_SHARED_SECRET here and the same value there.
function requireAuth(req, res, next) {
  if (!SHARED_SECRET) return next(); // no secret set = auth disabled (local/dev only)
  const provided = req.header("x-mcp-secret");
  if (provided !== SHARED_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, vaultDir: VAULT_DIR });
});

// Stateless mode: a fresh McpServer + transport per request. The vault data
// itself is what actually persists (on disk), so statelessness here just
// means we don't keep MCP session objects in memory between requests --
// fine for a single-instance Render free-tier deployment.
app.post("/mcp", requireAuth, async (req, res) => {
  try {
    const server = new McpServer({ name: "memory-vault", version: "1.0.0" });
    registerMemoryTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[memory-vault] request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode does not support GET (server->client streaming) or DELETE
// (session termination) -- respond clearly instead of hanging.
app.get("/mcp", requireAuth, (req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode." });
});
app.delete("/mcp", requireAuth, (req, res) => {
  res.status(405).json({ error: "Method not allowed in stateless mode." });
});

app.listen(PORT, () => {
  console.log(`[memory-vault] listening on port ${PORT}`);
  console.log(`[memory-vault] vault dir: ${VAULT_DIR}`);
  console.log(`[memory-vault] auth: ${SHARED_SECRET ? "enabled" : "DISABLED (set MCP_SHARED_SECRET)"}`);
});
