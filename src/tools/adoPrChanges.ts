// src/tools/adoPrChanges.ts
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getAdoConfig } from "../utils/utilities.js";
import { adoPrChangesSchema, AdoPrChangesInput } from "./adoPrChangesSchema.js";
import { getAdoConnectionAndApi, getPrDetails, getLatestPrIterationChanges } from "./adoPrChangesService.js";
import { formatPrChangesOutput } from "./adoPrChangesFormatter.js";

// Export schema for registration
export { adoPrChangesSchema };

export const adoPrChangesHandler = async (input: AdoPrChangesInput): Promise<CallToolResult> => {
  try {
    const config = await getAdoConfig(input.organizationId);

    if (!config.organization || !config.project || !config.pat) {
      return { content: [{ type: "text", text: "ERROR: Missing required configuration parameters (organization, project, pat)." }], isError: true };
    }

    const { gitApi } = await getAdoConnectionAndApi(config.organization, config.pat);

    const pullRequestIdNum = parseInt(input.pullRequestId, 10);
    const pr = await getPrDetails(gitApi, pullRequestIdNum, config.project);

    if (!pr || !pr.repository?.id || !pr.sourceRefName || !pr.targetRefName) {
      return { content: [{ type: "text", text: "ERROR: Could not retrieve valid PR details." }], isError: true };
    }

    const repositoryId = pr.repository.id;
    const sourceBranch = pr.sourceRefName.replace("refs/heads/", "");
    const targetBranch = pr.targetRefName.replace("refs/heads/", "");

    const { iterationChanges, latestIteration } = await getLatestPrIterationChanges(gitApi, repositoryId, pullRequestIdNum, config.project);

    // Pass necessary arguments to the formatter
    const output = await formatPrChangesOutput(
      gitApi,
      repositoryId,
      config.project,
      input.pullRequestId,
      sourceBranch,
      targetBranch,
      iterationChanges,
      latestIteration
    );

    return { content: [{ type: "text", text: output }] };

  } catch (error: any) {
    console.error("Error processing ADO PR changes:", error);
    return { content: [{ type: "text", text: `ERROR: Failed to get PR changes. ${error.message}` }], isError: true };
  }
};