// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME } from "./utils/utilities.js";
import { gitMergeDiffSchema, gitMergeDiffHandler } from "./tools/gitMergeDiff/gitMergeDiff.js";
import { adoPrChangesSchema, adoPrChangesHandler } from "./tools/adoPrChanges/adoPrChanges.js";
import adoPrCommentTool from "./tools/adoPrComment/adoPrComment.js";
import { AdoPrCommentRequestSchema, AdoPrCommentResponse } from "./tools/adoPrComment/adoPrCommentSchema.js";

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
  "git_merge_diff",
  "Generates the text diff for a Git merge commit against its first parent within a specified local repository.",
  gitMergeDiffSchema,
  gitMergeDiffHandler
);

// Register the new ADO PR changes tool (TypeScript-based)
server.tool(
  "ado_pr_changes", 
  "Fetches changes from an Azure DevOps Pull Request with full diff content using the Azure DevOps Node API.",
  adoPrChangesSchema.shape, // Use .shape here
  adoPrChangesHandler
);

// Register the new ADO PR comment tool
server.tool(
  "ado_pr_comment",
  "Posts a comment to an Azure DevOps Pull Request. Can reply to existing threads or create new ones.",
  AdoPrCommentRequestSchema.shape, // Use .shape here for Zod schema
  adoPrCommentTool
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