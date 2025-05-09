// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME } from "./utils/fileConstants.js";
import { registerTools } from "./toolRegistrar.js"; // Import the new registrar

// --- Configuration log output ---
console.error(`[Config] Server Name: ${SERVER_NAME}`);
// ---------------------

// Create server instance
const server = new McpServer({
  name: SERVER_NAME,
  version: "1.1.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register all tools using the registrar
registerTools(server);

// --- Main Server Execution ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[MCP Server] ${SERVER_NAME} running on stdio...`);
}

main().catch((error) => {
  console.error("[MCP Server] Fatal error:", error);
  process.exit(1);
});