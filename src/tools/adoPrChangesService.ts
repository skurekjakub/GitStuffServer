import * as azdev from "azure-devops-node-api";
import { GitApi } from "azure-devops-node-api/GitApi.js";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { getAdoConfig, streamToString } from "../utils/utilities.js";

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
 * Fetches the content of a file at a specific commit.
 */
export async function getFileContent(
    gitApi: GitApi,
    repositoryId: string,
    path: string,
    project: string,
    commitSha: string
): Promise<string> {
    try {
        const contentStream: NodeJS.ReadableStream = await gitApi.getItemContent(
            repositoryId, // repositoryId
            path, // path
            project, // project
            undefined, // scopePath
            GitInterfaces.VersionControlRecursionType.None, // recursionType
            true, // includeContentMetadata
            true, // latestProcessedChange
            false, //  // fileName
            { // versionDescriptor
                version: commitSha,
                versionType: GitInterfaces.GitVersionType.Commit,
                versionOptions: GitInterfaces.GitVersionOptions.None
            },
            true
        );
        return await streamToString(contentStream);
    } catch (err: any) {
        if (err.statusCode === 404) {
            return ""; // Return empty string for not found files
        }
        throw err; // Rethrow other errors
    }
}