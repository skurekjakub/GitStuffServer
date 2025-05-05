// src/tools/adoPrChangedFiles.ts
import { z } from "zod";
import { runPowershellScript, ADO_PR_FILES_SCRIPT_PATH, getAdoConfig } from "../utils/utilities.js";
// Tool schema definition
export const adoPrChangedFilesSchema = {
    pullRequestId: z.string().min(1).regex(/^\d+$/).describe("The numeric ID of the Pull Request (as a string)."),
    organizationId: z.string().min(1).describe("Optional organization identifier to load specific configuration settings.")
};
// Tool handler implementation
export async function adoPrChangedFilesHandler({ pullRequestId: providedPrId, organizationId: providedOrgId }) {
    // First get configuration from environment and files based on the organizationId
    const config = await getAdoConfig(providedOrgId);
    // Log which organization configuration we're using
    if (providedOrgId) {
        console.error(`[Tool] Using organization ID: ${providedOrgId} for configuration`);
    }
    // Use provided values or fall back to configuration
    const organization = config.organization;
    const project = config.project;
    const repository = config.repository;
    const pullRequestId = providedPrId || config.defaultPullRequestId;
    const pat = config.pat;
    console.error(`[Tool] 'get_ado_pr_changed_files' called for PR #${pullRequestId} in ${organization}/${project}/${repository}`);
    // Validate required parameters
    if (!organization) {
        const errorMsg = `Error: Azure DevOps organization not provided. Please specify it in the tool parameters, in ado_config.json${providedOrgId ? ` (organizations.${providedOrgId})` : ' (default)'}, or set the ${providedOrgId ? `ADO_${providedOrgId.toUpperCase()}_ORG` : 'ADO_ORG'} environment variable.`;
        console.error(`[Tool] Missing parameter: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    if (!project) {
        const errorMsg = `Error: Azure DevOps project not provided. Please specify it in the tool parameters, in ado_config.json${providedOrgId ? ` (organizations.${providedOrgId})` : ' (default)'}, or set the ${providedOrgId ? `ADO_${providedOrgId.toUpperCase()}_PROJECT` : 'ADO_PROJECT'} environment variable.`;
        console.error(`[Tool] Missing parameter: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    if (!repository) {
        const errorMsg = `Error: Azure DevOps repository not provided. Please specify it in the tool parameters, in ado_config.json${providedOrgId ? ` (organizations.${providedOrgId})` : ' (default)'}, or set the ${providedOrgId ? `ADO_${providedOrgId.toUpperCase()}_REPO` : 'ADO_REPO'} environment variable.`;
        console.error(`[Tool] Missing parameter: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    if (!pullRequestId) {
        const errorMsg = `Error: Pull Request ID not provided. Please specify it in the tool parameters, in ado_config.json${providedOrgId ? ` (organizations.${providedOrgId})` : ' (default)'}, or set the ${providedOrgId ? `ADO_${providedOrgId.toUpperCase()}_PR_ID` : 'ADO_PR_ID'} environment variable.`;
        console.error(`[Tool] Missing parameter: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    if (!pat) {
        // Check if PAT is missing
        const errorMsg = `Error: ADO Personal Access Token (PAT) not found. Please set the ${providedOrgId ? `ADO_${providedOrgId.toUpperCase()}_PAT` : 'ADO_PAT'} environment variable or add it to ado_config.json${providedOrgId ? ` (organizations.${providedOrgId})` : ' (default)'}.`;
        console.error(`[Tool] Auth Error: ${errorMsg}`);
        return { content: [{ type: "text", text: errorMsg }] };
    }
    // Prepare arguments for the PowerShell script
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
