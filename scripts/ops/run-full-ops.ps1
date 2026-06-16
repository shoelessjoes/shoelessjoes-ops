# Full Dealernet ops pass — active stock, purchase report, optional pricing scrape.
param(
    [switch]$IncludePricing,
    [string]$PricingProfile = "daily",
    [switch]$IncludePricingAlerts,
    [switch]$IncludeCatalogExport,
    [switch]$SkipDbCheck
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectRoot

if (-not $SkipDbCheck) {
    Write-Host "[$(Get-Date -Format s)] full-ops: ensure Postgres"
    npm run db:up:wait
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "[$(Get-Date -Format s)] full-ops: active stock (ingest, poll, catalog, purchase dry-run)"
& (Join-Path $PSScriptRoot "run-active-stock.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] full-ops: report-purchases"
npm run job:report-purchases
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] full-ops: update-purchase-tracking (dry-run)"
npm run job:update-purchase-tracking
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($IncludePricing) {
    $pricingArgs = @("-Profile", $PricingProfile, "-IncludeReview")
    if ($IncludePricingAlerts) { $pricingArgs += "-IncludeAlerts" }
    if ($IncludeCatalogExport) { $pricingArgs += "-IncludeCatalogExport" }
    Write-Host "[$(Get-Date -Format s)] full-ops: dealernet pricing ($PricingProfile)"
    & (Join-Path $PSScriptRoot "run-dealernet-pricing.ps1") @pricingArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Full ops pass complete."
Write-Host "  Purchase sync: dry-run only. Live: npm run job:sync-offers:purchase:execute"
Write-Host "  Sale sync:     npm run job:sync-offers:sale:execute  (inventory impact)"
Write-Host "  Review:        ..\shoelessjoes-supplier-py\out\review\email_summary.html (if -IncludePricing)"
