import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { readFile, unlink, stat } from "fs/promises"; // Added 'stat'
import path from "path";
import os from "os";
import { fileURLToPath } from 'url';
import util from 'util';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// --- Configuration ---
const SERVER_NAME = "git_diff_generator";
const SCRIPT_NAME = "GenerateMergeDiff.ps1"; // Name of the PowerShell script
const OUTPUT_DIFF_FILE = "merge_changes.diff"; // Name of the file the script creates

// Get the directory of the current module (__dirname equivalent for ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // This will point to the 'build' directory after compilation

// Resolve path to the script in the project root (assuming 'build' dir is sibling to the script)
const projectRootDir = path.resolve(__dirname, '..'); // Go up one level from 'build'
const SCRIPT_PATH = path.resolve(projectRootDir, SCRIPT_NAME);

// Output file is created in the Current Working Directory (CWD) of the node process
const OUTPUT_FILE_PATH = path.resolve(process.cwd(), OUTPUT_DIFF_FILE);

console.error(`[Config] Server Name: ${SERVER_NAME}`);
console.error(`[Config] Script Path: ${SCRIPT_PATH}`);
console.error(`[Config] Expected Output File Path (in CWD): ${OUTPUT_FILE_PATH}`);
// ---------------------

// Promisify execFile for async/await usage
const execFilePromise = util.promisify(execFile);

// Create server instance
const server = new McpServer({
  name: SERVER_NAME,
  version: "1.0.1", // Increment version
  capabilities: {
    resources: {}, // No resources defined
    tools: {},     // Tools will be added via server.tool()
  },
});

// Helper function to run the PowerShell script asynchronously
async function runPowershellScript(commitHash: string): Promise<{ success: boolean; stdout: string; stderr: string; code: number | null; errorMessage?: string }> {
    const platform = os.platform();
    const executable = platform === "win32" ? "powershell.exe" : "pwsh"; // Use pwsh for non-windows
    const args = [
        "-ExecutionPolicy", "Bypass",
        "-NoProfile", // Faster startup, less interference
        "-File", SCRIPT_PATH,
        "-CommitHash", commitHash
    ];

    console.error(`[Exec] Running: ${executable} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    try {
        // Check if script file exists before trying to run it
        await stat(SCRIPT_PATH); // Use stat to check existence

        const { stdout, stderr } = await execFilePromise(executable, args);
        // Exit code 0 usually means success for PowerShell scripts
        console.error(`[Exec] Script finished.`);
        console.error(`[Exec] Script stdout:\n${stdout}`);
        if (stderr) {
            console.error(`[Exec] Script stderr:\n${stderr}`);
        }
        // Treat exit code 0 as success, let the handler check file content
        return { success: true, stdout: stdout || '', stderr: stderr || '', code: 0 };

    } catch (error: any) {
        // execFile rejects on non-zero exit code or other errors
        console.error(`[Exec] Error executing script:`, error);

        let errorMessage = `Failed to execute PowerShell script.`;
        const exitCode = error.code ?? null; // Get exit code if available
        const stdout = error.stdout || '';
        const stderr = error.stderr || '';

        if (error.code === 'ENOENT') {
            errorMessage = `Error: Command '${executable}' not found. Is PowerShell (pwsh/powershell.exe) installed and in PATH?`;
        } else if (typeof error.code === 'number' && error.code !== 0) {
             errorMessage = `Script failed with exit code ${error.code}.`;
             if (stderr) errorMessage += `\nStderr:\n${stderr}`;
             if (stdout) errorMessage += `\nStdout:\n${stdout}`; // Include stdout too, might have info
        } else if (stderr) {
            errorMessage += `\nStderr:\n${stderr}`;
        } else if (error.message) {
            errorMessage += `\nDetails: ${error.message}`;
        }
        // Check specific ENOENT for the script file path
        if (error.syscall === 'spawn' && error.path === executable && error.code === 'ENOENT') {
             // Handled above
        } else if (error.message?.includes(SCRIPT_PATH) && error.code === 'ENOENT') {
             errorMessage = `Error: PowerShell script not found at expected location: ${SCRIPT_PATH}`;
        }


        return { success: false, stdout: stdout, stderr: stderr, code: exitCode, errorMessage };
    }
}

// --- MCP Tool Definition ---
server.tool(
  "get_git_merge_diff", // Tool name
  "Generates the text diff for a Git merge commit against its first parent.", // Tool description
  { // Input schema using Zod
    commitHash: z.string().min(6).regex(/^[a-fA-F0-9]+$/, "Must be a valid hex commit hash").describe("The Git commit hash (SHA) of the merge commit."),
  },
  // Tool implementation (async function)
  async ({ commitHash }): Promise<CallToolResult> => {
    console.error(`[Tool] 'get_git_merge_diff' called with commitHash: ${commitHash}`);

    const { success, stdout: scriptStdout, stderr: scriptStderr, errorMessage, code } = await runPowershellScript(commitHash);

    if (!success) {
      // Script execution failed (non-zero exit code or execution error)
      console.error(`[Tool] Script execution failed. Code: ${code}. Error: ${errorMessage}`);
      return {
        content: [{ type: "text", text: `Error generating diff: ${errorMessage || 'Unknown execution error'}` }],
      };
    }

    // Script execution reported success (exit code 0)
    console.error(`[Tool] Script execution succeeded (Exit Code: 0).`);

    let diffContent = "";
    let fileError = false;
    let fileErrorMessage = "";

    try {
        console.error(`[Tool] Attempting to read diff file: ${OUTPUT_FILE_PATH}`);
        diffContent = await readFile(OUTPUT_FILE_PATH, { encoding: "utf8" });
        console.error(`[Tool] Successfully read ${diffContent.length} characters from diff file.`);

        if (!diffContent.trim()) {
            // File exists but is empty or whitespace only
            diffContent = `Script executed successfully, but the generated diff was empty.`;
            // Include script's stdout if it contains success/warning message from PS script
            if (scriptStdout.includes("diff was empty") || scriptStdout.includes("succeeded")) {
                 diffContent += `\nScript Output:\n${scriptStdout.trim()}`;
            }
            console.warn("[Tool] Diff file was empty.");
        }

    } catch (readError: any) {
        fileError = true;
        console.error(`[Tool] Error reading diff file '${OUTPUT_FILE_PATH}': ${readError}`);
        if (readError.code === 'ENOENT') {
            fileErrorMessage = `Error: Script finished successfully, but the expected output file '${OUTPUT_DIFF_FILE}' was not found in the working directory (${process.cwd()}).`;
        } else {
            fileErrorMessage = `Error: Script finished successfully, but failed to read output file '${OUTPUT_DIFF_FILE}': ${readError.message}`;
        }
        // Set content to the file error message
        diffContent = fileErrorMessage;
    }

    // Attempt to clean up the diff file if script ran (even if reading failed)
    // We try to delete it based on where the script *should* have created it.
    try {
        await unlink(OUTPUT_FILE_PATH);
        console.error(`[Tool] Successfully deleted temporary diff file: ${OUTPUT_FILE_PATH}`);
    } catch (unlinkError: any) {
        // Log error but don't necessarily override the primary result unless file reading failed
        if (unlinkError.code !== 'ENOENT') { // Don't warn if file didn't exist anyway
             console.warn(`[Tool] Warning: Failed to delete temporary diff file '${OUTPUT_FILE_PATH}': ${unlinkError.message}`);
             if (!fileError) { // Append warning only if file reading was successful
                 diffContent += `\n(Warning: Could not delete temporary diff file.)`;
             }
        }
    }

    // Return the content (diff, empty message, or file read error)
    return {
      content: [{ type: "text", text: diffContent }],
    };
  }
);

// --- Main Server Execution ---
async function main() {
  const transport = new StdioServerTransport();
  // Connect server instance to the transport
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with MCP communication over stdio
  console.error(`[MCP Server] ${SERVER_NAME} running on stdio...`);
}

main().catch((error) => {
  console.error("[MCP Server] Fatal error:", error);
  process.exit(1);
});
