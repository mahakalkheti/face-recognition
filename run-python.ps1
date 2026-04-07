[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ScriptName,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $projectRoot ".venv\\Scripts\\python.exe"
$scriptPath = Join-Path $projectRoot "python\\$ScriptName"

if (-not (Test-Path $venvPython)) {
    throw "Python environment missing hai. Pehle `npm run setup:python` chalao."
}

if (-not (Test-Path $scriptPath)) {
    throw "Python script nahi mili: $scriptPath"
}

& $venvPython $scriptPath @ScriptArgs
