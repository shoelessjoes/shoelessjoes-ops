# Refresh sealed Shopify catalog + UPC tier CSVs for pricing match (run ~weekly).
$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectRoot

Write-Host "[$(Get-Date -Format s)] catalog: export-catalog"
npm run job:export-catalog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] catalog: export-upc-tiers"
npm run job:export-upc-tiers
exit $LASTEXITCODE
