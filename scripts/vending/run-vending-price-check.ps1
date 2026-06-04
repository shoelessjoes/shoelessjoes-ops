# Run full Shopify vs Zhongda vending price check from repo root.
$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectRoot

Write-Host "[$(Get-Date -Format s)] vending-price-check starting"
npm run job:vending-price-check
$code = $LASTEXITCODE
if ($code -eq 2) {
  Write-Host "[$(Get-Date -Format s)] completed with price mismatches (exit 2)"
  exit 2
}
if ($code -ne 0) { exit $code }
Write-Host "[$(Get-Date -Format s)] vending-price-check OK (no mismatches)"
