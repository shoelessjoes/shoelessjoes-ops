# Dealernet pricing table vs Shopify UPCs (uses supplier-py for scrape + match).
param(
    [string]$Profile = "daily",
    [string]$SupplierPyRoot = "C:\Users\burke\Git2\shoelessjoes-supplier-py",
    [switch]$IncludeReview,
    [switch]$IncludeAlerts,
    [int]$AlertMax = 25
)

$ErrorActionPreference = "Stop"
$opsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $opsRoot

Write-Host "[$(Get-Date -Format s)] pricing: export-catalog"
npm run job:export-catalog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] pricing: export-upc-tiers"
npm run job:export-upc-tiers
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path $SupplierPyRoot)) {
    throw "supplier-py not found at $SupplierPyRoot - set -SupplierPyRoot"
}

$dataDir = Join-Path $SupplierPyRoot "data"
$outDir = Join-Path $SupplierPyRoot "out"
New-Item -ItemType Directory -Force -Path $dataDir, $outDir | Out-Null

Copy-Item (Join-Path $opsRoot "data\upcs_in_stock.csv") $dataDir -Force
Copy-Item (Join-Path $opsRoot "data\upcs_out_of_stock.csv") $dataDir -Force
Copy-Item (Join-Path $opsRoot "data\upcs_all_barcodes.csv") $dataDir -Force
Copy-Item (Join-Path $opsRoot "data\shopify_variants_for_pricing.csv") (Join-Path $outDir "shopify_variants.csv") -Force

Set-Location $SupplierPyRoot

$python = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }

Write-Host "[$(Get-Date -Format s)] pricing: scrape Dealernet table (profile=$Profile)"
& $python -m src.main scrape-supplier --supplier-config "configs/dealernetx.$Profile.yaml" --out "out/supplier_$Profile.csv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[$(Get-Date -Format s)] pricing: match supplier vs Shopify"
& $python -m src.main match --supplier "out/supplier_$Profile.csv" --shopify "out/shopify_variants.csv" --out "out/matches_$Profile.csv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($IncludeReview) {
    Write-Host "[$(Get-Date -Format s)] pricing: review pack"
    & $python -m src.main build-review-pack --matches "out/matches_$Profile.csv" --out-dir out/review --min-bucket high --top-n 250
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($IncludeAlerts) {
    Write-Host "[$(Get-Date -Format s)] pricing: add-alerts (max=$AlertMax)"
    & $python -m src.main add-alerts --supplier-config "configs/dealernetx.$Profile.yaml" --matches "out/matches_$Profile.csv" --price-source suggested --min-priority-bucket high --max-alerts $AlertMax --execute
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "[$(Get-Date -Format s)] pricing complete - see $SupplierPyRoot\out\matches_$Profile.csv"
