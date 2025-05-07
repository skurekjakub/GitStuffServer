// src/tools/adoPrChanges/adoPrChangesFormatter.ts
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { GitApi } from "azure-devops-node-api/GitApi.js";
// Adjusted import path for service assuming flat structure in build/tools
import { getFileContent } from "./adoPrChangesService.js";
import { generateSimpleDiff } from "../../utils/utilities.js";

const MEDIA_EXTENSIONS = [
    // Image extensions
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.ico',
    // Video extensions
    '.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm', '.mpeg', '.mpg',
    // Audio extensions
    '.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a',
    // Document/Binary (often large and not useful for diff)
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.bin', '.pkg', '.dmg'
];

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
    let output = `Changes for PR #${pullRequestId} (TARGET BRANCH:${targetBranch} SOURCE BRANCH:${sourceBranch}) (UPDATED):\n\n`;

    if (!iterationChanges?.changeEntries || iterationChanges.changeEntries.length === 0) {
        return "No changes found in the latest PR iteration.";
    }

    for (const change of iterationChanges.changeEntries) {
        if (!change.item?.path || !change.changeType) {
            continue;
        }

        const currentPath = change.item.path;
        const originalPath = change.sourceServerItem ?? currentPath;

        // Check if the file extension is a media extension
        const fileExtension = currentPath.substring(currentPath.lastIndexOf('.')).toLowerCase();
        if (MEDIA_EXTENSIONS.includes(fileExtension)) {
            output += `[SKIPPED_MEDIA] ${originalPath}\n\n`;
            continue; // Skip processing for this media file
        }

        const changeTypeEnumVal = change.changeType as GitInterfaces.VersionControlChangeType;
        const changeTypeName = GitInterfaces.VersionControlChangeType[changeTypeEnumVal] || `Unknown (${change.changeType})`;
        
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
                    } catch (err: any) {
                        output += `    WARN: Could not fetch target content: ${err.message}\n\n`;
                    }
                } else if (!targetCommitSha) {
                    output += `    WARN: Could not determine target commit SHA.\n\n`;
                }

                // Generate diff output only if both contents are available
                if (baseContent && targetContent) {
                    output += `    == DIFF ==\n`;
                    const diffResult = generateSimpleDiff(baseContent, targetContent); // target is original, base is modified (source branch)
                    output += diffResult.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n\n";
                } else if (!baseContent && targetContent) {
                    // Handle case where file was likely added and edited in the PR (only target exists)
                    output += `    == NEW CONTENT (File likely added and edited in PR) ==\n`;
                    output += `    ------------------------\n`;
                    output += targetContent.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                    output += `    ------------------------\n\n`;
                } else if (baseContent && !targetContent) {
                    // Handle case where file might have been edited then deleted? Unlikely but possible.
                     output += `    WARN: Original content found but updated content is missing.\n`;
                } else {
                     // Only add warning if we intended to show a diff but couldn't fetch either file
                     if (baseCommitSha || targetCommitSha) { // Check if we expected content
                        output += `    WARN: Could not fetch content to generate diff.\n`;
                     }
                }

            } else if (changeTypeName.toLowerCase().includes("add")) {
                output += `  --> Showing new file content...\n`;
                
                // Get added file content
                if (targetCommitSha && currentPath && sourceBranch) { // Ensure sourceBranch is available
                    try {
                        // Pass isNewFile=true and the sourceBranch to handle new files
                        const content = await getFileContent(gitApi, repositoryId, currentPath, project, targetCommitSha, true, sourceBranch);
                        
                        // Check if the content starts with "Error:" which indicates an issue
                        if (content.startsWith("Error:")) {
                            output += `    WARNING: ${content}\n`;
                        } else if (content) {
                            output += `    == NEW FILE CONTENT (Commit: ${targetCommitSha.substring(0, 7)}) ==\n`;
                            output += `    ------------------------\n`;
                            output += content.split("\n").map((line: string) => `    ${line}`).join("\n") + "\n";
                            output += `    ------------------------\n`;
                        } else {
                            output += `    WARN: Could not fetch content for this new file.\n`;
                            output += `    This is likely because the file was just added in the PR and\n`;
                            output += `    the Azure DevOps API cannot access it directly.\n`;
                            output += `    Please view this file in the Azure DevOps web interface.\n`;
                        }
                    } catch (err: any) {
                        output += `    WARN: Could not fetch new file content: ${err.message}\n`;
                    }
                } else if (!targetCommitSha) {
                    output += `    WARN: Could not determine target commit SHA.\n\n`;
                } else if (!sourceBranch) {
                    output += `    WARN: Could not determine source branch for fetching new file.\n\n`;
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
    console.log(output);
    return output;
}
