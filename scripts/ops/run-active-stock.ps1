# Dealernet active stock — ingest offers + poll inbox (+ optional catalog). No Shopify export by default.
param([switch]$IncludeCatalog)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectRoot

Write-Host "[$(Get-Date -Format s)] active-stock: ingest-offers"
npm run job:ingest-offers
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] active-stock: poll-messages"
npm run job:poll-messages
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($IncludeCatalog) {
    & (Join-Path $PSScriptRoot "run-catalog-export.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "[$(Get-Date -Format s)] active-stock: purchase dry-run"
npm run job:sync-offers:purchase
exit $LASTEXITCODE
