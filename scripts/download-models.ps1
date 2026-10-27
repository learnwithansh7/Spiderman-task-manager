<#
.SYNOPSIS
  Downloads official speech recognition models for SpiderReminder.
.DESCRIPTION
  This script prompts for approval before downloading the official Vosk offline speech model
  from Alpha Cephei's repository.
#>

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$modelsDir = Join-Path $projectRoot "models\vosk"
$modelName = "vosk-model-small-en-us-0.15"
$targetDir = Join-Path $modelsDir $modelName
$zipUrl = "https://alphacephei.com/vosk/models/$modelName.zip"
$zipPath = Join-Path $modelsDir "$modelName.zip"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        SpiderReminder - Offline Model Downloader         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target Model:   $modelName (Vosk Small US English Speech Model)" -ForegroundColor Yellow
Write-Host "Official URL:   $zipUrl" -ForegroundColor Yellow
Write-Host "Destination:    $targetDir" -ForegroundColor Yellow
Write-Host "Download Size:  ~40 MB (unpacked ~110 MB)" -ForegroundColor Yellow
Write-Host "License:        Apache License 2.0 (Alpha Cephei Inc.)" -ForegroundColor Yellow
Write-Host ""

if (Test-Path $targetDir) {
    Write-Host "[OK] Model is already installed at: $targetDir" -ForegroundColor Green
    exit 0
}

if (-not $Force) {
    $confirm = Read-Host "Do you approve downloading this official model from $zipUrl ? (y/N)"
    if ($confirm -notmatch '^(y|yes)$') {
        Write-Host "Download cancelled by user. No files were downloaded." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nCreating directory: $modelsDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null

Write-Host "Downloading $zipUrl ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting model files to $modelsDir ..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $modelsDir -Force

if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Write-Host "[SUCCESS] Model successfully installed to: $targetDir" -ForegroundColor Green
Write-Host "SpiderReminder is ready to run offline voice recognition." -ForegroundColor Green
