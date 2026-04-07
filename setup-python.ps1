[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPath = Join-Path $projectRoot ".venv"
$requirementsPath = Join-Path $projectRoot "python\\requirements.txt"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-Python312Command {
    try {
        $installed = py -0p 2>$null
        if ($installed -match "3\.12") {
            return "py -3.12"
        }
    } catch {
    }

    try {
        python3.12 -c "import sys; print(sys.version)" | Out-Null
        return "python3.12"
    } catch {
    }

    return $null
}

Write-Step "Checking Python 3.12"
$pythonLauncher = Get-Python312Command

if (-not $pythonLauncher) {
    Write-Host "Python 3.12 not found. Installing with winget..." -ForegroundColor Yellow
    winget install --id Python.Python.3.12 --exact --source winget --accept-package-agreements --accept-source-agreements
    $env:PATH += ";$env:LocalAppData\\Microsoft\\WindowsApps"
    $pythonLauncher = Get-Python312Command
}

if (-not $pythonLauncher) {
    throw "Python 3.12 install nahi mila. Please manually install Python 3.12 and rerun this script."
}

Write-Host "Using launcher: $pythonLauncher"

if (Test-Path $venvPath) {
    Write-Step "Resetting existing .venv"
    Remove-Item -LiteralPath $venvPath -Recurse -Force
}

Write-Step "Creating virtual environment"
if ($pythonLauncher -eq "py -3.12") {
    py -3.12 -m venv $venvPath
} else {
    & $pythonLauncher -m venv $venvPath
}

$venvPython = Join-Path $venvPath "Scripts\\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "Virtual environment create hua, lekin python executable nahi mila: $venvPython"
}

Write-Step "Upgrading pip"
& $venvPython -m pip install --upgrade pip

Write-Step "Installing Python dependencies"
& $venvPython -m pip install -r $requirementsPath

Write-Step "Done"
Write-Host "Python environment ready." -ForegroundColor Green
Write-Host "Activate: .\\.venv\\Scripts\\Activate.ps1"
Write-Host "Capture:  npm run py:capture -- --label raj_patel --samples 40"
Write-Host "Train:    npm run py:train"
Write-Host "Recognize:npm run py:recognize -- --api-url http://localhost:3000/api/attendance/mark"
