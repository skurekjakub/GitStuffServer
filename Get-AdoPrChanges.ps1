<#
.SYNOPSIS
Fetches the changed files from the latest iteration of an Azure DevOps Pull Request.

.DESCRIPTION
This script connects to Azure DevOps using a Personal Access Token (PAT) to:
1. Find the latest iteration ID for a specified Pull Request.
2. Retrieve the list of file changes associated with that iteration.
3. Display the changed files with their change type (Add, Edit, Delete, Rename).

.PARAMETER Organization
The name of your Azure DevOps organization.
Defaults to $env:ADO_ORG if set.

.PARAMETER Project
The name of your Azure DevOps project.
Defaults to $env:ADO_PROJECT if set.

.PARAMETER Repository
The name or ID of the Git repository.
Defaults to $env:ADO_REPO if set.

.PARAMETER PullRequestId
The numeric ID of the Pull Request.
Defaults to $env:ADO_PR_ID if set.

.PARAMETER PAT
Your Azure DevOps Personal Access Token with 'Code (Read)' scope.
Defaults to $env:ADO_PAT if set.

.EXAMPLE
.\Get-AdoPrChanges.ps1 -Organization "MyOrg" -Project "MyProject" -Repository "MyRepo" -PullRequestId 123 -PAT "your_pat_here"

.EXAMPLE
# Assuming environment variables ADO_ORG, ADO_PROJECT, ADO_REPO, ADO_PR_ID, ADO_PAT are set
.\Get-AdoPrChanges.ps1

.NOTES
Author: AI Assistant
Requires PowerShell 5.1 or later (for Invoke-RestMethod improvements).
Ensure your PAT has at least 'Code (Read)' permissions.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Organization = $env:ADO_ORG,

    [Parameter(Mandatory=$false)]
    [string]$Project = $env:ADO_PROJECT,

    [Parameter(Mandatory=$false)]
    [string]$Repository = $env:ADO_REPO,

    [Parameter(Mandatory=$false)]
    [string]$PullRequestId = $env:ADO_PR_ID,

    [Parameter(Mandatory=$false)]
    [string]$PAT = $env:ADO_PAT
)

# --- Validate Input ---
if ([string]::IsNullOrWhiteSpace($Organization)) { Write-Error "Organization parameter is missing or empty."; return }
if ([string]::IsNullOrWhiteSpace($Project)) { Write-Error "Project parameter is missing or empty."; return }
if ([string]::IsNullOrWhiteSpace($Repository)) { Write-Error "Repository parameter is missing or empty."; return }
if ([string]::IsNullOrWhiteSpace($PullRequestId)) { Write-Error "PullRequestId parameter is missing or empty."; return }
if ([string]::IsNullOrWhiteSpace($PAT)) { Write-Error "PAT parameter is missing or empty. Provide it via -PAT argument or ADO_PAT environment variable."; return }

# --- Configuration ---
$ApiVersion = "7.0" # Use a recent, stable API version

# --- Authentication Header ---
Write-Verbose "Creating Authentication Header..."
try {
    $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$($PAT)"))
    $headers = @{
        Authorization = "Basic $base64AuthInfo"
        Accept        = "application/json"
    }
} catch {
    Write-Error "Failed to create Base64 authentication string: $($_.Exception.Message)"
    return
}

# --- API URLs ---
$encodedProject = [System.Web.HttpUtility]::UrlEncode($Project) # Handle spaces/special chars in project name
$encodedRepo = [System.Web.HttpUtility]::UrlEncode($Repository) # Handle spaces/special chars in repo name

$iterationsUrl = "https://dev.azure.com/$Organization/$encodedProject/_apis/git/repositories/$encodedRepo/pullrequests/$PullRequestId/iterations?api-version=$ApiVersion"

# --- Main Logic ---

# 1. Get Iterations to find the latest one
Write-Host "Fetching iterations for PR #$PullRequestId in '$Organization/$Project/$Repository'..."
try {
    $iterationsResponse = Invoke-RestMethod -Uri $iterationsUrl -Method Get -Headers $headers
} catch {
    Write-Error "Error fetching iterations: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $errorResponse = $streamReader.ReadToEnd()
        $streamReader.Close()
        Write-Error "API Response Body: $errorResponse"
    }
    return
}

if (-not $iterationsResponse -or -not $iterationsResponse.value -or $iterationsResponse.count -eq 0) {
    Write-Warning "No iterations found for Pull Request #$PullRequestId."
    return
}

# Find the latest iteration (highest ID)
$latestIteration = $iterationsResponse.value | Sort-Object -Property id -Descending | Select-Object -First 1
$latestIterationId = $latestIteration.id
Write-Host "Latest iteration ID found: $latestIterationId"

# 2. Get Changes for the latest iteration
$changesUrl = "https://dev.azure.com/$Organization/$encodedProject/_apis/git/repositories/$encodedRepo/pullrequests/$PullRequestId/iterations/$latestIterationId/changes?api-version=$ApiVersion"

Write-Host "Fetching changes for iteration $latestIterationId..."
try {
    $changesResponse = Invoke-RestMethod -Uri $changesUrl -Method Get -Headers $headers
} catch {
    $errorMsg = $_.Exception.Message
    Write-Error "Error fetching changes for iteration ${latestIterationId}: ${errorMsg}"
    if ($_.Exception.Response) {
        $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $errorResponse = $streamReader.ReadToEnd()
        $streamReader.Close()
        Write-Error "API Response Body: $errorResponse"
    }
    return
}

if (-not $changesResponse -or -not $changesResponse.changeEntries) {
    Write-Warning "No change entries found for iteration $latestIterationId."
    # It's possible the latest iteration had no file changes if only metadata was updated.
    return
}

# 3. Display Changes
Write-Host "----------------------------------------"
Write-Host "Changed Files in PR #$PullRequestId (Iteration $latestIterationId):"
Write-Host "----------------------------------------"

foreach ($change in $changesResponse.changeEntries) {
    $filePath = $change.item.path
    $changeType = $change.changeType

    # Simple Diff-like format
    $prefix = "?" # Default for unknown/other types
    switch ($changeType.ToLower()) {
        "add"       { $prefix = "+" }
        "edit"      { $prefix = "*" }
        "delete"    { $prefix = "-" }
        "rename"    { $prefix = "R"; $filePath = "$($change.sourceServerItem) -> $($filePath)" } # Show source for renames
        "edit, rename" { $prefix = "R*"; $filePath = "$($change.sourceServerItem) -> $($filePath)" } # Handle combined types if API returns them
        # Add cases for other types like 'undelete', 'branch', 'merge' if needed
    }

    Write-Host "$prefix [$($changeType.ToUpper())] `t$filePath"
}

Write-Host "----------------------------------------"
Write-Host "Found $($changesResponse.changeEntries.Count) changed items."