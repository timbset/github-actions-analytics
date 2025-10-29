param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,               # e.g. "DevExpress"
    [Parameter(Mandatory = $true)]
    [string]$Repo,                # e.g. "dxvcs"
    [Parameter(Mandatory = $true)]
    [string]$PackageName,         # e.g. "my-package"
    [Parameter(Mandatory = $true)]
    [string]$Version,             # e.g. "1.0.0"
    [Parameter(Mandatory = $true)]
    [string]$FilePath,            # e.g. "./my-package-1.0.0.file"
    [Parameter(Mandatory = $true)]
    [string]$GithubToken,         # GitHub token with "write:packages" and "delete:packages"
    [ValidateSet("users", "orgs")]
    [string]$ScopeType = "orgs",  # "orgs" is for organizations and "users" is for personal repositories
    [bool]$Force = $false         # unpublishes packages if version is already published
)

$baseApiUrl = "https://api.github.com"
$headers = @{
    "Authorization" = "Bearer $GithubToken"
    "Accept"        = "application/vnd.github+json"
}

if ($Force) {
    Write-Host "Looking for existing version"

    try {
        $versionsUrl = "$baseApiUrl/$ScopeType/$Owner/packages/maven/$PackageName/versions"
        $versions = Invoke-RestMethod -Uri $versionsUrl -Headers $headers -ErrorAction Stop

        $versionObj = $versions | Where-Object { $_.name -eq $Version }

        if ($versionObj) {
            $versionId = $versionObj.id
            Write-Host "Found existing version ID $versionId - deleting..."
            $deleteUrl = "$baseApiUrl/$ScopeType/$Owner/packages/maven/$PackageName/versions/$versionId"

            Invoke-RestMethod -Uri $deleteUrl -Method DELETE -Headers $headers -ErrorAction Stop
            Write-Host "Deleted version $Version successfully"
        } else {
            Write-Host "No existing version $Version found"
        }
    } catch {
        Write-Host "❌ Failed to check or delete old version:" -ForegroundColor Red
        Write-Host $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message
        }
        exit 1
    }
}

$file = "test-extension-$Version.vsix" # TODO: use from param
$url = "https://maven.pkg.github.com/$Owner/$Repo/$PackageName/$Version/$file"

try {
    $response = Invoke-RestMethod `
      -Uri $url `
      -Method Put `
      -Headers @{
        "Authorization" = "Bearer $GithubToken"
        "Content-Type"  = "application/octet-stream"
      } `
      -InFile $file `
      -ErrorAction Stop

    Write-Host "Successfully uploaded to GitHub Packages"
} catch {
    Write-Host "Upload failed:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    exit 1
}
