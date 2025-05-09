// src/tools/adoPrThreads/adoPrThreads.ts
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AdoPrThreadsRequest, AdoPrThreadsRequestSchema } from "./adoPrThreadsSchema.js";
import { getAdoConnectionAndApi, getPrDetails, getActivePrThreads } from "./adoPrThreadsService.js";
import { getAdoConfig } from "../../utils/configManager.js";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";

export { AdoPrThreadsRequestSchema };

export const adoPrThreadsHandler = async (input: AdoPrThreadsRequest): Promise<CallToolResult> => {
  console.log("[AdoPrThreadsTool] Received request:", input);
  try {
    const config = await getAdoConfig(input.organizationId);

    if (!config.organization || !config.project || !config.pat) {
      return {
        content: [{ type: "text", text: "ERROR: Missing required configuration parameters (organization, project, pat)." }],
        isError: true,
      };
    }

    const { gitApi } = await getAdoConnectionAndApi(config.organization, config.pat);
    const pullRequestIdNum = parseInt(input.pullRequestId, 10);

    if (isNaN(pullRequestIdNum)) {
        return { 
            content: [{ type: "text", text: "ERROR: pullRequestId must be a numeric string." }], 
            isError: true 
        };
    }

    const pr = await getPrDetails(gitApi, pullRequestIdNum, config.project);
    if (!pr || !pr.repository?.id) {
      return { 
        content: [{ type: "text", text: "ERROR: Could not retrieve valid PR details or repository ID." }], 
        isError: true 
      };
    }
    const repositoryId = pr.repository.id;

    const activeThreads: GitInterfaces.GitPullRequestCommentThread[] = await getActivePrThreads(
      gitApi,
      repositoryId,
      pullRequestIdNum,
      config.project
    );

    console.log(`[AdoPrThreadsTool] Found ${activeThreads.length} active threads.`);

    return {
      content: [{ type: "text", text: JSON.stringify(activeThreads, null, 2) }],
    };

  } catch (error: any) {
    console.error("[AdoPrThreadsTool] Error:", error);
    return {
      content: [{ type: "text", text: `ERROR: Failed to get active PR threads. ${error.message}` }],
      isError: true,
    };
  }
};
