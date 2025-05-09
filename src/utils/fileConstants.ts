// src/utils/fileConstants.ts
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRootDir = path.resolve(__dirname, '../..');

// Server Constants
export const SERVER_NAME = "GitStuffServer";

// Script and Output File Names
export const SCRIPT_NAME = "GenerateMergeDiff.ps1";
export const ADO_PR_FILES_SCRIPT_NAME = "Get-AdoPrChanges.ps1"; 
export const OUTPUT_DIFF_FILE = "merge_changes.diff";

// Full Paths
export const SCRIPT_PATH = path.resolve(projectRootDir, SCRIPT_NAME);
export const ADO_PR_FILES_SCRIPT_PATH = path.resolve(projectRootDir, ADO_PR_FILES_SCRIPT_NAME);
export const OUTPUT_FILE_PATH = path.resolve(process.cwd(), OUTPUT_DIFF_FILE); // In CWD
