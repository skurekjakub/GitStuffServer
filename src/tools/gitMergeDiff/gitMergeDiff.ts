// src/tools/gitMergeDiff/gitMergeDiff.ts
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { readFile, unlink } from "fs/promises";
import { 
  runPowershellScript
} from "../../utils/scriptRunner.js";
import {
  OUTPUT_FILE_PATH,
  OUTPUT_DIFF_FILE,
  SCRIPT_PATH
} from "../../utils/fileConstants.js";

// Tool schema definition
export const gitMergeDiffSchema = {
  commitHash: z.string().min(6).regex(/^[a-fA-F0-9]+$/, "Must be a valid hex commit hash")
    .describe("The Git commit hash (SHA) of the merge commit."),
  repoPath: z.string().min(1)
    .describe("The absolute path to the local Git repository directory.")
};

// Tool handler implementation
export async function gitMergeDiffHandler({ commitHash, repoPath }: {
  commitHash: string;
  repoPath: string;
}): Promise<CallToolResult> {
  console.error(`[Tool] 'get_git_merge_diff' called with commitHash: ${commitHash}, repoPath: ${repoPath}`);

  // Basic validation for absolute path
  if (!path.isAbsolute(repoPath)) {
    const message = "Error: repoPath must be an absolute path.";
    console.error(`[Tool] Validation Failed: ${message}`);
    return { content: [{ type: "text", text: message }] };
  }

  // Prepare arguments for the PowerShell script
  const scriptArgs = {
    CommitHash: commitHash,
    RepoPath: repoPath
  };

  // Execute the script with the new calling approach
  const { success, stdout: scriptStdout, stderr: scriptStderr, errorMessage, code } = 
    await runPowershellScript(SCRIPT_PATH, scriptArgs);

  if (!success) {
    console.error(`[Tool] Script execution failed. Code: ${code}. Error: ${errorMessage}`);
    // Make error message slightly more user-friendly
    let finalErrorMessage = `Error generating diff: ${errorMessage || 'Unknown execution error'}`;
    if (code === 1 && (scriptStderr?.includes("Repository path") || scriptStdout?.includes("Repository path"))) {
      finalErrorMessage = `Error: Invalid Repository Path specified: ${repoPath}. Path does not exist or is not a directory.`;
    } else if (code !== null && code !== 0) {
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
  } catch (readError: any) {
    fileError = true;
    console.error(`[Tool] Error reading diff file '${OUTPUT_FILE_PATH}': ${readError}`);
    if (readError.code === 'ENOENT') {
      fileErrorMessage = `Error: Script finished successfully, but the expected output file '${OUTPUT_DIFF_FILE}' was not found in the working directory (${process.cwd()}). Check permissions or script execution details.`;
    } else {
      fileErrorMessage = `Error: Script finished successfully, but failed to read output file '${OUTPUT_DIFF_FILE}': ${readError.message}`;
    }
    diffContent = fileErrorMessage;
  }

  // Attempt to clean up the diff file
  try {
    await unlink(OUTPUT_FILE_PATH);
    console.error(`[Tool] Successfully deleted temporary diff file: ${OUTPUT_FILE_PATH}`);
  } catch (unlinkError: any) {
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
}
