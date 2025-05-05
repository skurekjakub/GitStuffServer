// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME } from "./utils/utilities.js";
import { gitMergeDiffSchema, gitMergeDiffHandler } from "./tools/gitMergeDiff.js";
import { adoPrChangedFilesSchema, adoPrChangedFilesHandler } from "./tools/adoPrChangedFiles.js";

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

// Register the git merge diff tool
server.tool(
  "get_git_merge_diff",
  "Generates the text diff for a Git merge commit against its first parent within a specified local repository.",
  gitMergeDiffSchema,
  gitMergeDiffHandler
);

// Register the ADO PR changed files tool
server.tool(
  "get_ado_pr_changed_files", 
  "Fetches the list of changed files from the latest iteration of an Azure DevOps Pull Request using a PowerShell script.",
  adoPrChangedFilesSchema,
  adoPrChangedFilesHandler
);

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