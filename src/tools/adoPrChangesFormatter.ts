import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { GitApi } from "azure-devops-node-api/GitApi.js";
import { getFileContent } from "./adoPrChangesService.js";

/**
 * Formats the PR changes into a readable string output.
 */
export async function formatPrChangesOutput(
    gitApi: GitApi,
    repositoryId: string,
    project: string,
    pullRequestId: string,
    sourceBranch: string,
    targetBranch: string,
    iterationChanges: GitInterfaces.GitPullRequestIterationChanges,
    latestIteration: GitInterfaces.GitPullRequestIteration
): Promise<string> {
    let output = `Changes for PR #${pullRequestId} (${sourceBranch} -> ${targetBranch}):\n\n`;

    if (!iterationChanges?.changeEntries || iterationChanges.changeEntries.length === 0) {
        return "No changes found in the latest PR iteration.";
    }

    for (const change of iterationChanges.changeEntries) {
        if (!change.item?.path || !change.changeType) {
            continue;
        }

        const changeTypeEnumVal = change.changeType as GitInterfaces.VersionControlChangeType;
        const changeTypeName = GitInterfaces.VersionControlChangeType[changeTypeEnumVal] || `Unknown (${change.changeType})`;
        const currentPath = change.item.path;
        const originalPath = change.sourceServerItem ?? currentPath;
        
        output += `[${changeTypeName}] ${originalPath}`;
        if (changeTypeName.toLowerCase().includes("rename")) {
            output += ` -> ${currentPath}`;
        }
        output += `\n`;

        const baseCommitSha = latestIteration.sourceRefCommit?.commitId;
        const targetCommitSha = latestIteration.targetRefCommit?.commitId;

        const baseCheckPath = (changeTypeName.toLowerCase().includes("add")) ? undefined : originalPath;
        
        try {
            if (changeTypeName.toLowerCase().includes("edit") || changeTypeName.toLowerCase().includes("rename")) {
                output += `  --> Showing diff...\n`;
                
                // Get base content if applicable
                let baseContent = "";
                if (baseCommitSha && baseCheckPath) {
                    try {
                        baseContent = await getFileContent(gitApi, repositoryId, baseCheckPath, project, baseCommitSha);
                        if (baseContent) {
                            output += `    == ORIGINAL CONTENT (Commit: ${baseCommitSha.substring(0, 7)}) ==\n`;
                            output += `    ------------------------\n`;
                            output += baseContent.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                            output += `    ------------------------\n\n`;
                        } else {
                            output += `    INFO: Original content not found at commit ${baseCommitSha.substring(0, 7)} (likely added in this PR).\n\n`;
                        }
                    } catch (err: any) {
                        output += `    WARN: Could not fetch base content: ${err.message}\n\n`;
                    }
                } else if (!baseCommitSha) {
                    output += `    WARN: Could not determine base commit SHA.\n\n`;
                }

                // Get target content
                let targetContent = "";
                if (targetCommitSha && currentPath) {
                    try {
                        targetContent = await getFileContent(gitApi, repositoryId, currentPath, project, targetCommitSha);
                        if (targetContent) {
                            output += `    == UPDATED CONTENT (Commit: ${targetCommitSha.substring(0, 7)}) ==\n`;
                            output += `    ------------------------\n`;
                            output += targetContent.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                            output += `    ------------------------\n\n`;
                        } else {
                            output += `    WARN: Could not fetch target content.\n\n`;
                        }
                    } catch (err: any) {
                        output += `    WARN: Could not fetch target content: ${err.message}\n\n`;
                    }
                } else if (!targetCommitSha) {
                    output += `    WARN: Could not determine target commit SHA.\n\n`;
                }

                // Generate diff output
                if (baseContent && targetContent) {
                    output += `    == DIFF ==\n`;
                    output += `    (Diff generation logic not implemented)\n\n`; 
                } else if (!baseContent && targetContent) {
                    output += `    == NEW CONTENT (File likely added and edited in PR) ==\n`;
                    output += `    ------------------------\n`;
                    output += targetContent.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                    output += `    ------------------------\n\n`;
                }

            } else if (changeTypeName.toLowerCase().includes("add")) {
                output += `  --> Showing new file content...\n`;
                
                // Get added file content
                if (targetCommitSha && currentPath) {
                    try {
                        const content = await getFileContent(gitApi, repositoryId, currentPath, project, targetCommitSha);
                        if (content) {
                            output += `    == NEW FILE CONTENT (Commit: ${targetCommitSha.substring(0, 7)}) ==\n`;
                            output += `    ------------------------\n`;
                            output += content.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                            output += `    ------------------------\n`;
                        } else {
                            output += `    WARN: Could not fetch new file content.\n`;
                        }
                    } catch (err: any) {
                        output += `    WARN: Could not fetch new file content: ${err.message}\n`;
                    }
                } else if (!targetCommitSha) {
                    output += `    WARN: Could not determine target commit SHA.\n\n`;
                }
            } else if (changeTypeName.toLowerCase().includes("delete")) {
                output += `  --> Showing deleted file content...\n`;
                
                // Get deleted file content
                if (baseCommitSha && baseCheckPath) {
                    try {
                        const content = await getFileContent(gitApi, repositoryId, baseCheckPath, project, baseCommitSha);
                        if (content) {
                            output += `    == DELETED FILE CONTENT (Commit: ${baseCommitSha.substring(0, 7)}) ==\n`;
                            output += `    ------------------------\n`;
                            output += content.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                            output += `    ------------------------\n`;
                        } else {
                            output += `    INFO: Deleted content not found at commit ${baseCommitSha.substring(0, 7)} (likely added and deleted in this PR).\n\n`;
                        }
                    } catch (err: any) {
                        output += `    WARN: Could not fetch deleted file content: ${err.message}\n`;
                    }
                } else if (!baseCommitSha) {
                    output += `    WARN: Could not determine base commit SHA.\n\n`;
                }
            }
        } catch (err: any) {
            output += `    ERROR processing change for ${originalPath}: ${err.message}\n\n`;
        }
        output += "\n"; 
    }

    return output;
}