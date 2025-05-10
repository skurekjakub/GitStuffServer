<#
.SYNOPSIS
Generates a diff file for a Git merge commit relative to its first parent,
targeting a specific repository path.

.DESCRIPTION
Takes a Git commit hash and a repository path as input. Executes
'git -C <RepoPath> show -m --first-parent <CommitHash>' and saves the output
(including potential errors) to 'merge_changes.diff' in the script's
current working directory.

.PARAMETER CommitHash
The Git commit hash (SHA) of the merge commit to analyze. Mandatory.

.PARAMETER RepoPath
The absolute path to the local Git repository directory. Mandatory.

.EXAMPLE
.\GenerateMergeDiff.ps1 -CommitHash abc1234efg -RepoPath C:\path\to\my\repo
# Creates 'merge_changes.diff' in the current directory with the diff from the specified repo.

.OUTPUTS
Creates a file named 'merge_changes.diff' in the current directory.
Outputs status messages to the console.

.NOTES
Requires Git to be installed and accessible in the system's PATH.
The output file 'merge_changes.diff' will be overwritten if it already exists.
The script redirects all output streams from the git command (including errors)
to the output file.
Ensure the user running the script has read permissions for the specified RepoPath.
#>
param(
    [Parameter(Mandatory=$true,
               Position=0,
               HelpMessage="Enter the Git commit hash (SHA) of the merge commit.")]
    [string]$CommitHash,

    [Parameter(Mandatory=$true,
               Position=1,
               HelpMessage="Enter the absolute path to the local Git repository directory.")]
    [string]$RepoPath
)

$OutputFileName = "merge_changes.diff"
# Output file path is relative to the script's CWD (caller's CWD usually)
$FullOutputPath = Join-Path -Path (Get-Location) -ChildPath $OutputFileName

# --- Input Validation ---
Write-Host "Validating repository path: $RepoPath"
if (-not (Test-Path -Path $RepoPath -PathType Container)) {
    Write-Error "Error: Repository path '$RepoPath' does not exist or is not a directory."
    exit 1 # Exit with a non-zero code
}

# --- Command Execution ---
# Use 'git -C <path>' to run the command within the specified repository context
$GitCommand = "git --no-pager -C `"$RepoPath`" show -m --first-parent $CommitHash -U100" # Use backticks for quotes if path has spaces

Write-Host "Running command in context of '$RepoPath': $GitCommand"
Write-Host "Output will be saved to: $FullOutputPath (relative to current CWD)"

try {
    # Execute the git command using -C and redirect all output streams (*>&1) to the file
    # Using UTF8 encoding is generally recommended for diff files.
    # Use Invoke-Expression to handle the command string with potential quotes in paths
    Invoke-Expression "$GitCommand *>&1" | Set-Content -Path $OutputFileName -Encoding UTF8 -Force
    
    # Check the exit code of the last external command (git)
    # Note: $LASTEXITCODE reflects Invoke-Expression's success, which might mask git's exit code if redirection fails early.
    # A slightly more robust way might involve temporary files or Start-Process, but this is usually sufficient.
    # A simple check is often done just by checking $?. $? is true if the last command succeeded (exit 0)
    if (-not $?) { # Check if the last command failed
         # Since Invoke-Expression ran, check $LASTEXITCODE if $? is false
         Write-Warning "Git command likely failed (Exit Code: $LASTEXITCODE). Check '$OutputFileName' for details (it might contain error messages from Git)."
         # exit $LASTEXITCODE # Optional: exit script with the same error code
    } else {
         # Command succeeded (exit code 0)
         # Check if the file was created and has content
         $fileInfo = Get-Item -Path $OutputFileName -ErrorAction SilentlyContinue
         if ($null -ne $fileInfo -and $fileInfo.Length -gt 0) {
             Write-Host -ForegroundColor Green "Successfully generated diff and saved to '$OutputFileName'."
         } elseif ($null -ne $fileInfo) {
             Write-Host -ForegroundColor Yellow "Git command succeeded, but the diff was empty or only contained metadata. '$OutputFileName' created."
         } else {
             Write-Warning "Git command seemed to succeed ($LASTEXITCODE=0), but the output file '$OutputFileName' was not created or is empty."
         }
    }
} catch {
    # Catch PowerShell-level errors (e.g., 'git' command not found, invalid script operations)
    Write-Error "A PowerShell script error occurred: $($_.Exception.Message)"
    exit 1 # Exit with a non-zero status code
}

# If you uncommented the exit lines above, this might not be reached on failure
# Write-Host "Script finished." # Optional final message