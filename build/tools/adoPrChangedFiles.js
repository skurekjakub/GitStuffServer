// src/tools/adoPrChangedFiles.ts
import { z } from "zod";
import { runPowershellScript, ADO_PR_FILES_SCRIPT_PATH } from "../utils/utilities.js";
// Tool schema definition
export const adoPrChangedFilesSchema = {
    organization: z.string().min(1).describe("Azure DevOps organization name."),
    project: z.string().min(1).describe("Azure DevOps project name."),
    repository: z.string().min(1).describe("Azure DevOps repository name or ID."),
    pullRequestId: z.string().regex(/^\d+$/).describe("The numeric ID of the Pull Request (as a string)."),
};
// Tool handler implementation
export async function adoPrChangedFilesHandler({ organization, project, repository, pullRequestId }) {
    console.error(`[Tool] 'get_ado_pr_changed_files' called for PR #${pullRequestId} in ${organization}/${project}/${repository}`);
    const pat = process.env.ADO_PAT; // Read PAT from environment variable set by VS Code MCP config
    if (!pat) {
        // Check if PAT is missing from environment
        const errorMsg = "Error: ADO_PAT environment variable is not set. Cannot authenticate ADO script. Configure it via MCP inputs/env in VS Code settings.";
        console.error(`[Tool] Auth Error: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    // Prepare arguments for the PowerShell script
    // The PAT is intentionally NOT passed here; the script reads it from the environment.
    const scriptArgs = {
        Organization: organization,
        Project: project,
        Repository: repository,
        PullRequestId: pullRequestId
        // PAT: pat // DO NOT PASS PAT AS ARGUMENT
    };
    // Execute the script, passing the ADO_PAT via environment
    const result = await runPowershellScript(ADO_PR_FILES_SCRIPT_PATH, scriptArgs, { ADO_PAT: pat } // Explicitly pass PAT in env for clarity, though script checks $env:ADO_PAT anyway
    );
    if (!result.success) {
        // Handle script execution errors
        console.error(`[Tool] ADO Script execution failed. Code: ${result.code}. Error: ${result.errorMessage}`);
        // Try to make the error message more specific if possible
        let finalErrorMessage = `Error fetching ADO PR changed files: ${result.errorMessage || 'Unknown execution error'}`;
        if (result.stderr?.includes("Error fetching iterations") || result.stderr?.includes("Error fetching changes")) {
            finalErrorMessage = `Error fetching ADO PR changed files: API call failed. Check parameters and PAT permissions. Details:\n${result.stderr}`;
        }
        else if (result.stderr?.includes("PAT parameter is missing")) {
            // This shouldn't happen if the env var check above works, but as a fallback
            finalErrorMessage = "Error: ADO PAT was not correctly passed to the script environment.";
        }
        return { content: [{ type: "text", text: finalErrorMessage }] };
    }
    // Success - return the standard output from the script
    console.error(`[Tool] Successfully fetched ADO PR changed files.`);
    const outputText = result.stdout.trim(); // Trim whitespace
    if (!outputText) {
        return { content: [{ type: "text", text: "Script executed successfully, but returned no output (no changes found or other issue)." }] };
    }
    return { content: [{ type: "text", text: outputText }] };
}
