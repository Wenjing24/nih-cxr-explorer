[CmdletBinding()]
param(
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# TLS 1.2 is needed by the download endpoints on older Windows PowerShell.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = $PSScriptRoot
$ToolsDir = Join-Path $ProjectRoot ".tools"
$UvDir = Join-Path $ToolsDir "uv"
$UvExe = Join-Path $UvDir "uv.exe"
$NodeDir = Join-Path $ToolsDir "node"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$VenvDir = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
Set-Location $ProjectRoot

if (-not (Test-Path -LiteralPath $UvExe)) {
    Write-Step "Downloading uv"
    New-Item -ItemType Directory -Force -Path $UvDir | Out-Null
    $UvInstaller = Join-Path $ToolsDir "uv-install.ps1"
    Invoke-WebRequest "https://astral.sh/uv/install.ps1" -OutFile $UvInstaller -UseBasicParsing

    # Keep uv inside this repository and do not change the user's PATH or shell profile.
    $env:UV_UNMANAGED_INSTALL = $UvDir
    $env:UV_NO_MODIFY_PATH = "1"
    Invoke-Checked "powershell.exe" "-NoProfile" "-ExecutionPolicy" "Bypass" "-File" $UvInstaller
    Remove-Item -LiteralPath $UvInstaller -Force
}

Write-Step "Preparing Python 3.11 and the project virtual environment"
$env:UV_CACHE_DIR = Join-Path $ToolsDir "uv-cache"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $ToolsDir "python"
$env:UV_PYTHON_BIN_DIR = Join-Path $ToolsDir "python-bin"
$env:UV_PYTHON_NO_REGISTRY = "1"
$env:UV_MANAGED_PYTHON = "1"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Invoke-Checked $UvExe "venv" "--python" "3.11" "--managed-python" $VenvDir
}
Invoke-Checked $UvExe "pip" "sync" "requirements.txt" "--python" $VenvPython

if (-not (Test-Path -LiteralPath $NodeExe)) {
    Write-Step "Downloading the current Node.js LTS release"
    $Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    switch ($Architecture) {
        "x64" { $NodeArchitecture = "x64" }
        "arm64" { $NodeArchitecture = "arm64" }
        default { throw "Unsupported Windows architecture: $Architecture" }
    }

    $Releases = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $Release = $Releases |
        Where-Object { $_.lts -and ([int](($_.version -replace '^v', '').Split('.')[0]) -ge 20) } |
        Select-Object -First 1
    if (-not $Release) {
        throw "Could not find a supported Node.js LTS release."
    }

    $NodeVersion = $Release.version
    $ArchiveName = "node-$NodeVersion-win-$NodeArchitecture.zip"
    $ArchivePath = Join-Path $ToolsDir $ArchiveName
    $ReleaseBaseUrl = "https://nodejs.org/dist/$NodeVersion"

    Invoke-WebRequest "$ReleaseBaseUrl/$ArchiveName" -OutFile $ArchivePath -UseBasicParsing

    # Verify the archive against the checksum published by Node.js.
    $Checksums = (Invoke-WebRequest "$ReleaseBaseUrl/SHASUMS256.txt" -UseBasicParsing).Content
    $ExpectedHashLine = ($Checksums -split "`n") |
        Where-Object { $_ -match "\s$([regex]::Escape($ArchiveName))\s*$" } |
        Select-Object -First 1
    if (-not $ExpectedHashLine) {
        throw "No published checksum was found for $ArchiveName."
    }
    $ExpectedHash = ($ExpectedHashLine.Trim() -split "\s+")[0].ToUpperInvariant()
    $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw "Checksum verification failed for $ArchiveName."
    }

    $ExtractDir = Join-Path $ToolsDir "node-extract"
    if (Test-Path -LiteralPath $ExtractDir) {
        Remove-Item -LiteralPath $ExtractDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $NodeDir) {
        Remove-Item -LiteralPath $NodeDir -Recurse -Force
    }
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractDir
    $ExtractedNodeDir = Join-Path $ExtractDir "node-$NodeVersion-win-$NodeArchitecture"
    Move-Item -LiteralPath $ExtractedNodeDir -Destination $NodeDir
    Remove-Item -LiteralPath $ExtractDir -Recurse -Force
    Remove-Item -LiteralPath $ArchivePath -Force
}

Write-Step "Installing web dependencies"
$env:Path = "$NodeDir;$env:Path"
Invoke-Checked $NpmCmd "ci"

if ($NoStart) {
    Write-Host "`nSetup complete. The development server was not started because -NoStart was supplied." -ForegroundColor Green
    exit 0
}

Write-Step "Starting NIH Chest X-Ray Explorer"
Write-Host "Press Ctrl+C to stop the server. Open the URL shown below in your browser." -ForegroundColor Green
Invoke-Checked $NpmCmd "run" "dev"
