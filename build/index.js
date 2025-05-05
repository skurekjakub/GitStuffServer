// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { readFile, unlink, stat } from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from 'url';
import util from 'util';
// --- Configuration ---
const SERVER_NAME = "GitStuffServer";
const SCRIPT_NAME = "GenerateMergeDiff.ps1";
const OUTPUT_DIFF_FILE = "merge_changes.diff";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootDir = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.resolve(projectRootDir, SCRIPT_NAME);
const OUTPUT_FILE_PATH = path.resolve(process.cwd(), OUTPUT_DIFF_FILE); // In CWD
console.error(`[Config] Server Name: ${SERVER_NAME}`);
console.error(`[Config] Script Path: ${SCRIPT_PATH}`);
console.error(`[Config] Expected Output File Path (in CWD): ${OUTPUT_FILE_PATH}`);
// ---------------------
const execFilePromise = util.promisify(execFile);
// Create server instance
const server = new McpServer({
    name: SERVER_NAME,
    version: "1.1.0", // Increment version
    capabilities: {
        resources: {},
        tools: {},
    },
});
// Helper function to run the PowerShell script asynchronously
// *** MODIFIED to accept repoPath ***
async function runPowershellScript(commitHash, repoPath) {
    const platform = os.platform();
    const executable = platform === "win32" ? "powershell.exe" : "pwsh";
    const args = [
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", SCRIPT_PATH,
        // Add the mandatory parameters for the script
        "-CommitHash", commitHash,
        "-RepoPath", repoPath
    ];
    console.error(`[Exec] Running: ${executable} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    // Ensure the Node process has read access to repoPath and write/delete in CWD for OUTPUT_FILE_PATH
    try {
        await stat(SCRIPT_PATH); // Check script exists
        // We expect the powershell script to validate repoPath internally now
        // using Test-Path. If invalid, it should exit non-zero.
        const { stdout, stderr } = await execFilePromise(executable, args, {
            // Optionally set CWD for the script, though -C in git might be enough
            // cwd: process.cwd() // Default is process.cwd() anyway
            // Increase max buffer size if diffs might be huge (default is 1MB)
            maxBuffer: 1024 * 1024 * 10 // 10 MB
        });
        console.error(`[Exec] Script finished.`);
        console.error(`[Exec] Script stdout:\n${stdout}`);
        if (stderr) {
            console.error(`[Exec] Script stderr:\n${stderr}`);
        }
        return { success: true, stdout: stdout || '', stderr: stderr || '', code: 0 };
    }
    catch (error) {
        console.error(`[Exec] Error executing script:`, error);
        let errorMessage = `Failed to execute PowerShell script.`;
        const exitCode = error.code ?? null;
        const stdout = error.stdout || '';
        const stderr = error.stderr || '';
        // ... (keep existing error message formatting logic) ...
        if (error.code === 'ENOENT') {
            errorMessage = `Error: Command '${executable}' not found. Is PowerShell (pwsh/powershell.exe) installed and in PATH?`;
        }
        else if (typeof error.code === 'number' && error.code !== 0) {
            // PS Script validation (like bad RepoPath) should cause non-zero exit
            errorMessage = `Script failed with exit code ${error.code}. Check Repo Path and Commit Hash.`;
            if (stderr)
                errorMessage += `\nStderr:\n${stderr}`; // stderr often has PS error details
            if (stdout)
                errorMessage += `\nStdout:\n${stdout}`;
        }
        else if (stderr) {
            errorMessage += `\nStderr:\n${stderr}`;
        }
        else if (error.message) {
            errorMessage += `\nDetails: ${error.message}`;
        }
        if (error.message?.includes(SCRIPT_PATH) && error.code === 'ENOENT') {
            errorMessage = `Error: PowerShell script not found at expected location: ${SCRIPT_PATH}`;
        }
        return { success: false, stdout: stdout, stderr: stderr, code: exitCode, errorMessage };
    }
}
// --- MCP Tool Definition ---
server.tool("get_git_merge_diff", "Generates the text diff for a Git merge commit against its first parent within a specified local repository.", // Updated description
{
    commitHash: z.string().min(6).regex(/^[a-fA-F0-9]+$/, "Must be a valid hex commit hash").describe("The Git commit hash (SHA) of the merge commit."),
    repoPath: z.string().min(1).describe("The absolute path to the local Git repository directory."), // Added repoPath
}, 
// *** MODIFIED handler: Destructure repoPath and pass it ***
async ({ commitHash, repoPath }) => {
    console.error(`[Tool] 'get_git_merge_diff' called with commitHash: ${commitHash}, repoPath: ${repoPath}`);
    // Basic validation for absolute path (simple check)
    if (!path.isAbsolute(repoPath)) {
        const message = "Error: repoPath must be an absolute path.";
        console.error(`[Tool] Validation Failed: ${message}`);
        return { content: [{ type: "text", text: message }] };
    }
    const { success, stdout: scriptStdout, stderr: scriptStderr, errorMessage, code } = await runPowershellScript(commitHash, repoPath); // Pass repoPath
    if (!success) {
        console.error(`[Tool] Script execution failed. Code: ${code}. Error: ${errorMessage}`);
        // Make error message slightly more user-friendly
        let finalErrorMessage = `Error generating diff: ${errorMessage || 'Unknown execution error'}`;
        if (code === 1 && (scriptStderr?.includes("Repository path") || scriptStdout?.includes("Repository path"))) {
            finalErrorMessage = `Error: Invalid Repository Path specified: ${repoPath}. Path does not exist or is not a directory.`;
        }
        else if (code !== null && code !== 0) {
            finalErrorMessage = `Error generating diff: Script failed (code ${code}). Check repository path and commit hash validity. Details might be in stderr or stdout logs.`;
        }
        return {
            content: [{ type: "text", text: finalErrorMessage }],
        };
    }
    // Script execution reported success (Exit Code: 0)
    console.error(`[Tool] Script execution succeeded (Exit Code: 0). Reading output file...`);
    let diffContent = "";
    let fileError = false;
    let fileErrorMessage = "";
    try {
        // ... (keep existing file reading logic) ...
        console.error(`[Tool] Attempting to read diff file: ${OUTPUT_FILE_PATH}`);
        diffContent = await readFile(OUTPUT_FILE_PATH, { encoding: "utf8" });
        console.error(`[Tool] Successfully read ${diffContent.length} characters from diff file.`);
        if (!diffContent.trim()) {
            diffContent = `Script executed successfully, but the generated diff was empty.`;
            if (scriptStdout.includes("diff was empty") || scriptStdout.includes("succeeded")) {
                diffContent += `\nScript Output:\n${scriptStdout.trim()}`;
            }
            console.warn("[Tool] Diff file was empty.");
        }
    }
    catch (readError) {
        // ... (keep existing file reading error handling) ...
        fileError = true;
        console.error(`[Tool] Error reading diff file '${OUTPUT_FILE_PATH}': ${readError}`);
        if (readError.code === 'ENOENT') {
            fileErrorMessage = `Error: Script finished successfully, but the expected output file '${OUTPUT_DIFF_FILE}' was not found in the working directory (${process.cwd()}). Check permissions or script execution details.`;
        }
        else {
            fileErrorMessage = `Error: Script finished successfully, but failed to read output file '${OUTPUT_DIFF_FILE}': ${readError.message}`;
        }
        diffContent = fileErrorMessage;
    }
    // Attempt to clean up the diff file
    try {
        // ... (keep existing file deletion logic) ...
        await unlink(OUTPUT_FILE_PATH);
        console.error(`[Tool] Successfully deleted temporary diff file: ${OUTPUT_FILE_PATH}`);
    }
    catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
            console.warn(`[Tool] Warning: Failed to delete temporary diff file '${OUTPUT_FILE_PATH}': ${unlinkError.message}`);
            if (!fileError) {
                diffContent += `\n(Warning: Could not delete temporary diff file.)`;
            }
        }
    }
    // Return the content
    return {
        content: [{ type: "text", text: diffContent }],
    };
});
// --- Main Server Execution ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MCP Server] ${SERVER_NAME} running on stdio...`);
}
main().catch((error) => {
    console.error("[MCP Server] Fatal error:", error);
    process.exit(1);
});
