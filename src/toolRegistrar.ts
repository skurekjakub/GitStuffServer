// src/toolRegistrar.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gitMergeDiffSchema, gitMergeDiffHandler } from "./tools/gitMergeDiff/gitMergeDiff.js";
import { adoPrChangesSchema, adoPrChangesHandler } from "./tools/adoPrChanges/adoPrChanges.js";
import adoPrCommentTool from "./tools/adoPrComment/adoPrComment.js";
import { AdoPrCommentRequestSchema } from "./tools/adoPrComment/adoPrCommentSchema.js";
import { AdoPrThreadsRequestSchema, adoPrThreadsHandler } from "./tools/adoPrThreads/adoPrThreads.js";

export function registerTools(server: McpServer): void {
  // Register the git merge diff tool
  server.tool(
    "git_merge_diff",
    "Generates the text diff for a Git merge commit against its first parent within a specified local repository.",
    gitMergeDiffSchema,
    gitMergeDiffHandler
  );

  // Register the ADO PR changes tool
  server.tool(
    "ado_pr_changes", 
    "Fetches changes from an Azure DevOps Pull Request with full diff content using the Azure DevOps Node API.",
    adoPrChangesSchema.shape, // Use .shape here
    adoPrChangesHandler
  );

  // Register the ADO PR comment tool
  server.tool(
    "ado_pr_comment",
    "Posts a comment to an Azure DevOps Pull Request. Can reply to existing threads or create new ones.",
    AdoPrCommentRequestSchema.shape, // Use .shape here for Zod schema
    adoPrCommentTool
  );

  // Register the ADO PR threads tool
  server.tool(
    "ado_pr_threads",
    "Fetches all active comment threads from an Azure DevOps Pull Request.",
    AdoPrThreadsRequestSchema.shape, // Use .shape here for Zod schema
    adoPrThreadsHandler
  );

  console.error("[Registrar] All tools registered with the server.");
}
