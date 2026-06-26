import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMemoryTools } from "./mcp-tools.js";
import { VAULT_DIR } from "./vault.js";

async function main() {
  const server = new McpServer({
    name: "memory-vault",
    version: "1.0.0",
  });

  registerMemoryTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio is the actual MCP channel, so all logging must go to stderr.
  console.error(`[memory-vault] running over stdio. Vault dir: ${VAULT_DIR}`);
}

main().catch((err) => {
  console.error("[memory-vault] fatal error:", err);
  process.exit(1);
});
