// src/utils/utilities.ts
import { execFile } from "child_process";
import { stat, readFile as fsReadFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import util from 'util';
import path from "path";
import { fileURLToPath } from 'url';
import * as diffLib from 'diff';

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
 * ADO configuration interface for a single organization
 */
export interface AdoConfig {
  pat?: string;
  organization?: string;
  project?: string;
  repository?: string;
  defaultPullRequestId?: string;
}

/**
 * Extended ADO configuration that supports multiple organizations
 */
export interface AdoConfigExtended {
  // Default configuration (when no organizationId is specified)
  default?: AdoConfig;
  
  // Named organization configurations
  organizations?: {
    [organizationId: string]: AdoConfig;
  };
}

/**
 * Attempts to read the Azure DevOps configuration from multiple sources.
 * Returns an object with available configuration values.
 * 
 * @param organizationId Optional organization ID to get specific config
 * @returns The ADO configuration object with available values
 */
export async function getAdoConfig(organizationId?: string): Promise<AdoConfig> {
  // Start with empty config
  const config: AdoConfig = {};
  
  // Try to read from JSON config file first
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      console.error(`[Config] Found ADO config file at ${CONFIG_FILE_PATH}, attempting to read`);
      const configContent = await fsReadFile(CONFIG_FILE_PATH, { encoding: 'utf-8' });
      
      try {
        const jsonConfig: AdoConfigExtended = JSON.parse(configContent);
        
        // Load default config first if available
        if (jsonConfig.default) {
          Object.assign(config, jsonConfig.default);
          console.error("[Config] Loaded default configuration");
        }
        
        // If a specific organization is requested and exists in config, override defaults
        if (organizationId && jsonConfig.organizations && jsonConfig.organizations[organizationId]) {
          console.error(`[Config] Using organization-specific config for ID: ${organizationId}`);
          const orgConfig = jsonConfig.organizations[organizationId];
          Object.assign(config, orgConfig);
        } 
        
        console.error("[Config] Successfully read ADO configuration from JSON file");
      } catch (parseError) {
        console.error(`[Config] Error parsing JSON configuration: ${parseError}`);
      }
    }
  } catch (error) {
    console.error(`[Config] Error reading ADO config file: ${error}`);
  }

  // Override with environment variables
  const envPrefix = organizationId ? `ADO_${organizationId.toUpperCase()}_` : 'ADO_';
  
  // Try organization-specific environment variables first
  if (process.env[`${envPrefix}PAT`]) {
    console.error(`[Config] Using ${envPrefix}PAT from environment variable`);
    config.pat = process.env[`${envPrefix}PAT`];
  } else if (!organizationId && process.env.ADO_PAT) {
    console.error("[Config] Using ADO_PAT from environment variable");
    config.pat = process.env.ADO_PAT;
  }
  
  if (process.env[`${envPrefix}ORG`]) {
    console.error(`[Config] Using ${envPrefix}ORG from environment variable`);
    config.organization = process.env[`${envPrefix}ORG`];
  } else if (!organizationId && process.env.ADO_ORG) {
    console.error("[Config] Using ADO_ORG from environment variable");
    config.organization = process.env.ADO_ORG;
  }
  
  if (process.env[`${envPrefix}PROJECT`]) {
    console.error(`[Config] Using ${envPrefix}PROJECT from environment variable`);
    config.project = process.env[`${envPrefix}PROJECT`];
  } else if (!organizationId && process.env.ADO_PROJECT) {
    console.error("[Config] Using ADO_PROJECT from environment variable");
    config.project = process.env.ADO_PROJECT;
  }
  
  if (process.env[`${envPrefix}REPO`]) {
    console.error(`[Config] Using ${envPrefix}REPO from environment variable`);
    config.repository = process.env[`${envPrefix}REPO`];
  } else if (!organizationId && process.env.ADO_REPO) {
    console.error("[Config] Using ADO_REPO from environment variable");
    config.repository = process.env.ADO_REPO;
  }
  
  if (process.env[`${envPrefix}PR_ID`]) {
    console.error(`[Config] Using ${envPrefix}PR_ID from environment variable`);
    config.defaultPullRequestId = process.env[`${envPrefix}PR_ID`];
  } else if (!organizationId && process.env.ADO_PR_ID) {
    console.error("[Config] Using ADO_PR_ID from environment variable");
    config.defaultPullRequestId = process.env.ADO_PR_ID;
  }
  
  return config;
}

/**
 * Attempts to read the Azure DevOps Personal Access Token (PAT) from multiple sources.
 * 
 * @param organizationId Optional organization ID to get specific PAT
 * @returns The PAT string if found, null otherwise
 */
export async function getAdoPat(organizationId?: string): Promise<string | null> {
  const config = await getAdoConfig(organizationId);
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
export async function runPowershellScript(
  scriptPath: string,
  args: Record<string, string>,
  env?: Record<string, string>
): Promise<{ success: boolean; stdout: string; stderr: string; code: number | null; errorMessage?: string }> {
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

    } catch (error: any) {
        console.error(`[Exec] Error executing script:`, error);
        let errorMessage = `Failed to execute PowerShell script.`;
        const exitCode = error.code ?? null;
        const stdout = error.stdout || '';
        const stderr = error.stderr || '';

        if (error.code === 'ENOENT') {
            errorMessage = `Error: Command '${executable}' not found. Is PowerShell (pwsh/powershell.exe) installed and in PATH?`;
        } else if (typeof error.code === 'number' && error.code !== 0) {
            errorMessage = `Script failed with exit code ${error.code}.`;
            if (stderr) errorMessage += `\nStderr:\n${stderr}`;
            if (stdout) errorMessage += `\nStdout:\n${stdout}`;
        } else if (stderr) {
            errorMessage += `\nStderr:\n${stderr}`;
        } else if (error.message) {
            errorMessage += `\nDetails: ${error.message}`;
        }
        
        if (error.message?.includes(scriptPath) && error.code === 'ENOENT') {
            errorMessage = `Error: PowerShell script not found at expected location: ${scriptPath}`;
        }

        return { success: false, stdout: stdout, stderr: stderr, code: exitCode, errorMessage };
    }
}

/**
 * Converts a ReadableStream to a string.
 * @param stream The stream to convert.
 * @returns A promise that resolves with the string content of the stream.
 */
export async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/**
 * Generates a line-by-line diff between two strings using the diff library.
 * @param originalContent The original string content.
 * @param modifiedContent The modified string content.
 * @returns A string representing the diff, with + for additions and - for deletions.
 */
export function generateSimpleDiff(modifiedContent: string, originalContent: string): string {
    const diffResult = diffLib.createPatch('file', originalContent, modifiedContent, 'original', 'modified');
    
    // Remove the header lines (first 4 lines) for a cleaner output
    const diffLines = diffResult.split('\n').slice(4);
    return diffLines.join('\n');
}