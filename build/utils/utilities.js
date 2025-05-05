// src/utils/utilities.ts
import { execFile } from "child_process";
import { stat } from "fs/promises";
import os from "os";
import util from 'util';
import path from "path";
import { fileURLToPath } from 'url';
// --- Configuration ---
export const SERVER_NAME = "GitStuffServer";
export const SCRIPT_NAME = "GenerateMergeDiff.ps1";
export const ADO_PR_FILES_SCRIPT_NAME = "Get-AdoPrChanges.ps1";
export const OUTPUT_DIFF_FILE = "merge_changes.diff";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRootDir = path.resolve(__dirname, '../..');
export const SCRIPT_PATH = path.resolve(projectRootDir, SCRIPT_NAME);
export const ADO_PR_FILES_SCRIPT_PATH = path.resolve(projectRootDir, ADO_PR_FILES_SCRIPT_NAME);
export const OUTPUT_FILE_PATH = path.resolve(process.cwd(), OUTPUT_DIFF_FILE); // In CWD
export const execFilePromise = util.promisify(execFile);
// Helper function to run the PowerShell script asynchronously
export async function runPowershellScript(scriptPathOrCommitHash, repoPathOrArgs, env) {
    const platform = os.platform();
    const executable = platform === "win32" ? "powershell.exe" : "pwsh";
    let args;
    const isADOMode = typeof repoPathOrArgs !== 'string';
    if (isADOMode) {
        // ADO PR files mode
        const scriptPath = scriptPathOrCommitHash;
        const scriptArgs = repoPathOrArgs;
        args = [
            "-ExecutionPolicy", "Bypass",
            "-NoProfile",
            "-File", scriptPath
        ];
        // Add all script arguments
        Object.entries(scriptArgs).forEach(([key, value]) => {
            args.push(`-${key}`, value);
        });
    }
    else {
        // Git diff mode (original behavior)
        const commitHash = scriptPathOrCommitHash;
        const repoPath = repoPathOrArgs;
        args = [
            "-ExecutionPolicy", "Bypass",
            "-NoProfile",
            "-File", SCRIPT_PATH,
            // Add the mandatory parameters for the script
            "-CommitHash", commitHash,
            "-RepoPath", repoPath
        ];
    }
    console.error(`[Exec] Running: ${executable} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    try {
        await stat(isADOMode ? scriptPathOrCommitHash : SCRIPT_PATH); // Check script exists
        const { stdout, stderr } = await execFilePromise(executable, args, {
            maxBuffer: 1024 * 1024 * 10, // 10 MB
            env: env ? { ...process.env, ...env } : process.env // Merge with process.env
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
        if (error.code === 'ENOENT') {
            errorMessage = `Error: Command '${executable}' not found. Is PowerShell (pwsh/powershell.exe) installed and in PATH?`;
        }
        else if (typeof error.code === 'number' && error.code !== 0) {
            errorMessage = `Script failed with exit code ${error.code}.`;
            if (stderr)
                errorMessage += `\nStderr:\n${stderr}`;
            if (stdout)
                errorMessage += `\nStdout:\n${stdout}`;
        }
        else if (stderr) {
            errorMessage += `\nStderr:\n${stderr}`;
        }
        else if (error.message) {
            errorMessage += `\nDetails: ${error.message}`;
        }
        const scriptPath = isADOMode ? scriptPathOrCommitHash : SCRIPT_PATH;
        if (error.message?.includes(scriptPath) && error.code === 'ENOENT') {
            errorMessage = `Error: PowerShell script not found at expected location: ${scriptPath}`;
        }
        return { success: false, stdout: stdout, stderr: stderr, code: exitCode, errorMessage };
    }
}
