// src/tools/adoPrThreads/adoPrThreadsService.ts
import { GitApi } from "azure-devops-node-api/GitApi.js";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { getAdoConfig } from "../../utils/configManager.js";
import * as azdev from "azure-devops-node-api";

/**
 * Establishes connection to Azure DevOps and returns the GitApi instance.
 * This function is similar to the one in adoPrChangesService & adoPrCommentService.
 */
export async function getAdoConnectionAndApi(organization: string, pat: string): Promise<{ connection: azdev.WebApi, gitApi: GitApi }> {
    const orgUrl = `https://dev.azure.com/${organization}`;
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi: GitApi = await connection.getGitApi();
    return { connection, gitApi };
}

/**
 * Fetches details for a specific Pull Request.
 * This function is similar to the one in adoPrChangesService.
 */
export async function getPrDetails(gitApi: GitApi, pullRequestId: number, project: string): Promise<GitInterfaces.GitPullRequest> {
    return await gitApi.getPullRequestById(pullRequestId, project);
}

/**
 * Fetches all active comment threads for a given pull request.
 */
export async function getActivePrThreads(
  gitApi: GitApi,
  repositoryId: string,
  pullRequestId: number,
  project: string
): Promise<GitInterfaces.GitPullRequestCommentThread[]> {
  const threads = await gitApi.getThreads(repositoryId, pullRequestId, project);
  
  // Filter for active threads. CommentThreadStatus.Active = 1
  // Adjust if the actual enum value is different or if a more direct status check is available.
  return threads.filter(thread => thread.status === GitInterfaces.CommentThreadStatus.Active);
}
