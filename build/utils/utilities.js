// src/utils/utilities.ts
import { execFile } from "child_process";
import { stat, readFile as fsReadFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import util from 'util';
import path from "path";
import { fileURLToPath } from 'url';
// --- Configuration ---
export const SERVER_NAME = "GitStuffServer";
export const SCRIPT_NAME = "GenerateMergeDiff.ps1";
export const ADO_PR_FILES_SCRIPT_NAME = "Get-AdoPrChanges.ps1";
export const OUTPUT_DIFF_FILE = "merge_changes.diff";
export const CONFIG_FILE_NAME = "ado_config.json";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRootDir = path.resolve(__dirname, '../..');
export const SCRIPT_PATH = path.resolve(projectRootDir, SCRIPT_NAME);
export const ADO_PR_FILES_SCRIPT_PATH = path.resolve(projectRootDir, ADO_PR_FILES_SCRIPT_NAME);
export const CONFIG_FILE_PATH = path.resolve(projectRootDir, CONFIG_FILE_NAME);
export const OUTPUT_FILE_PATH = path.resolve(process.cwd(), OUTPUT_DIFF_FILE); // In CWD
export const execFilePromise = util.promisify(execFile);
/**
 * Attempts to read the Azure DevOps configuration from multiple sources.
 * Returns an object with available configuration values.
 *
 * @returns The ADO configuration object with available values
 */
export async function getAdoConfig() {
    const config = {};
    // Try to read from JSON config file first
    try {
        if (existsSync(CONFIG_FILE_PATH)) {
            console.error(`[Config] Found ADO config file at ${CONFIG_FILE_PATH}, attempting to read`);
            const configContent = await fsReadFile(CONFIG_FILE_PATH, { encoding: 'utf-8' });
            try {
                const jsonConfig = JSON.parse(configContent);
                if (jsonConfig.pat)
                    config.pat = jsonConfig.pat;
                if (jsonConfig.organization)
                    config.organization = jsonConfig.organization;
                if (jsonConfig.project)
                    config.project = jsonConfig.project;
                if (jsonConfig.repository)
                    config.repository = jsonConfig.repository;
                if (jsonConfig.defaultPullRequestId)
                    config.defaultPullRequestId = jsonConfig.defaultPullRequestId;
                console.error("[Config] Successfully read ADO configuration from JSON file");
            }
            catch (parseError) {
                console.error(`[Config] Error parsing JSON configuration: ${parseError}`);
            }
        }
    }
    catch (error) {
        console.error(`[Config] Error reading ADO config file: ${error}`);
    }
    // Override with environment variables if they exist
    if (process.env.ADO_PAT) {
        console.error("[Config] Using ADO_PAT from environment variable");
        config.pat = process.env.ADO_PAT;
    }
    if (process.env.ADO_ORG) {
        console.error("[Config] Using ADO_ORG from environment variable");
        config.organization = process.env.ADO_ORG;
    }
    if (process.env.ADO_PROJECT) {
        console.error("[Config] Using ADO_PROJECT from environment variable");
        config.project = process.env.ADO_PROJECT;
    }
    if (process.env.ADO_REPO) {
        console.error("[Config] Using ADO_REPO from environment variable");
        config.repository = process.env.ADO_REPO;
    }
    if (process.env.ADO_PR_ID) {
        console.error("[Config] Using ADO_PR_ID from environment variable");
        config.defaultPullRequestId = process.env.ADO_PR_ID;
    }
    return config;
}
/**
 * Attempts to read the Azure DevOps Personal Access Token (PAT) from multiple sources.
 * Order of preference:
 * 1. Environment variable ADO_PAT
 * 2. ado_config.json file
 *
 * @returns The PAT string if found, null otherwise
 */
export async function getAdoPat() {
    const config = await getAdoConfig();
    return config.pat || null;
}
/**
 * Runs a PowerShell script with the provided arguments.
 *
 * @param scriptPath The path to the PowerShell script to run
 * @param args Key-value pairs of arguments to pass to the script
 * @param env Optional environment variables to pass to the process
 * @returns Result object with success status, stdout, stderr, etc.
 */
export async function runPowershellScript(scriptPath, args, env) {
    const platform = os.platform();
    const executable = platform === "win32" ? "powershell.exe" : "pwsh";
    // Prepare PowerShell arguments
    const psArgs = [
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", scriptPath
    ];
    // Add all script arguments
    Object.entries(args).forEach(([key, value]) => {
        psArgs.push(`-${key}`, value);
    });
    console.error(`[Exec] Running: ${executable} ${psArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    try {
        await stat(scriptPath); // Check script exists
        const { stdout, stderr } = await execFilePromise(executable, psArgs, {
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
        if (error.message?.includes(scriptPath) && error.code === 'ENOENT') {
            errorMessage = `Error: PowerShell script not found at expected location: ${scriptPath}`;
        }
        return { success: false, stdout: stdout, stderr: stderr, code: exitCode, errorMessage };
    }
}
