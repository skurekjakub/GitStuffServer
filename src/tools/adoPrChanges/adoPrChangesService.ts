// src/tools/adoPrChanges/adoPrChangesService.ts
import * as azdev from "azure-devops-node-api";
import { GitApi } from "azure-devops-node-api/GitApi.js";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { getAdoConfig, streamToString } from "../../utils/utilities.js";
import { TestRunOutcome } from "azure-devops-node-api/interfaces/TestInterfaces.js";

/**
 * Establishes connection to Azure DevOps and returns the GitApi instance.
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
 */
export async function getPrDetails(gitApi: GitApi, pullRequestId: number, project: string): Promise<GitInterfaces.GitPullRequest> {
    return await gitApi.getPullRequestById(pullRequestId, project);
}

/**
 * Fetches the changes from the latest iteration of a Pull Request.
 */
export async function getLatestPrIterationChanges(
    gitApi: GitApi, 
    repositoryId: string, 
    pullRequestId: number, 
    project: string
): Promise<{ 
    iterationChanges: GitInterfaces.GitPullRequestIterationChanges, 
    latestIteration: GitInterfaces.GitPullRequestIteration 
}> {
    const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, project);
    if (!iterations || iterations.length === 0) {
        throw new Error("Could not retrieve iterations for the PR.");
    }
    const latestIteration = iterations[iterations.length - 1];
    if (!latestIteration?.id) {
        throw new Error("Could not get latest iteration ID.");
    }

    const iterationChanges = await gitApi.getPullRequestIterationChanges(repositoryId, pullRequestId, latestIteration.id, project);
    if (!iterationChanges) {
        throw new Error("Could not retrieve changes for the latest PR iteration.");
    }
    return { iterationChanges, latestIteration };
}

/**
 * Fetches the content of a file at a specific commit or from the source branch for new files.
 * For new files (Add change type), we use the source branch to access the content.
 */
export async function getFileContent(
    gitApi: GitApi,
    repositoryId: string,
    path: string,
    project: string,
    commitSha: string, // Target commit for existing/modified/deleted files
    isNewFile: boolean = false,
    sourceBranch?: string // Source branch name, needed for new files
): Promise<string> {
    try {
        // Normalize the path (remove leading slash if present)
        const relativePath = path.startsWith('/') ? path.substring(1) : path;

        // Determine the version descriptor based on whether it's a new file
        let versionDescriptor: GitInterfaces.GitVersionDescriptor;
        if (isNewFile && sourceBranch) {
            versionDescriptor = {
                version: sourceBranch,
                versionType: GitInterfaces.GitVersionType.Branch
            };
        } else {
            versionDescriptor = {
                version: commitSha,
                versionType: GitInterfaces.GitVersionType.Commit
            };
        }

        // Use simpler API call with fewer parameters
        const contentStream: NodeJS.ReadableStream = await gitApi.getItemContent(
            repositoryId,
            relativePath,
            project,
            undefined, // scopePath
            undefined, // recursionLevel
            false,     // includeContentMetadata
            false,     // latestProcessedChange
            false,     // download
            versionDescriptor,
            true,      // includeContent (explicitly true)
            false      // resolveLfs
        );

        // Convert stream to string
        return await streamToString(contentStream);
    } catch (err: any) {
        if (err.statusCode === 404) {
            return isNewFile
                ? `Could not fetch this newly added file from branch '${sourceBranch || 'unknown'}'. You may need to view it in the Azure DevOps web interface.`
                : ""; // Return empty string for other not found files
        }

        // If we got an error response with JSON content, parse and return it in a readable format
        if (typeof err.message === 'string' && err.message.includes('{')) {
            try {
                // Try to extract the JSON part of the error message
                const jsonMatch = err.message.match(/({.*})/);
                if (jsonMatch && jsonMatch[1]) {
                    const errorJson = JSON.parse(jsonMatch[1]);
                    return `Error: ${errorJson.message || 'Unknown API error'}`;
                }
            } catch (parseErr) {
                // If we can't parse it, just return the original message
            }
        }

        return `Error accessing file content: ${err.message || 'Unknown error occurred'}`;
    }
}
