// src/utils/scriptRunner.ts
import { execFile } from "child_process";
import { stat } from "fs/promises";
import os from "os";
import util from 'util';

export const execFilePromise = util.promisify(execFile);

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
