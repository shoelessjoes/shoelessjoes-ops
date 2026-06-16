# Dealernet pricing table vs Shopify UPCs (uses supplier-py for scrape + match).
param(
    [string]$Profile = "daily",
    [string]$SupplierPyRoot = "C:\Users\burke\Git2\shoelessjoes-supplier-py",
    [switch]$IncludeReview,
    [switch]$IncludeAlerts,
    [switch]$IncludeCatalogExport,
    [int]$AlertMax = 25,
    [string]$LogFile = ""
)

$ErrorActionPreference = "Stop"
$opsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Import-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if ($key) { Set-Item -Path "env:$key" -Value $val }
    }
}

function Sync-SupplierPyEnv {
    param([string]$OpsEnvPath, [string]$SupplierEnvPath)
    Import-DotEnvFile -Path $OpsEnvPath
    Import-DotEnvFile -Path $SupplierEnvPath
    if (-not $env:SUPPLIER_USERNAME -and $env:DEALERNET_USERNAME) {
        $env:SUPPLIER_USERNAME = $env:DEALERNET_USERNAME
    }
    if (-not $env:SUPPLIER_PASSWORD -and $env:DEALERNET_PASSWORD) {
        $env:SUPPLIER_PASSWORD = $env:DEALERNET_PASSWORD
    }
    if (-not $env:SUPPLIER_USERNAME -or -not $env:SUPPLIER_PASSWORD) {
        throw @"
Missing Dealernet credentials for supplier-py.
Set SUPPLIER_USERNAME/SUPPLIER_PASSWORD in $SupplierEnvPath
or DEALERNET_USERNAME/DEALERNET_PASSWORD in $OpsEnvPath
"@
    }
}

function Invoke-Logged {
    param([scriptblock]$Block)
    if ($LogFile) {
        & $Block 2>&1 | Tee-Object -FilePath $LogFile -Append
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        & $Block
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

Set-Location $opsRoot

if ($IncludeCatalogExport) {
    Write-Host "[$(Get-Date -Format s)] pricing: Shopify catalog export (weekly/full)"
    & (Join-Path $PSScriptRoot "run-catalog-export.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "[$(Get-Date -Format s)] pricing: using existing data/*.csv (run run-catalog-export.ps1 weekly)"
    if (-not (Test-Path (Join-Path $opsRoot "data\shopify_variants_for_pricing.csv"))) {
        Write-Host "  catalog CSV missing - running export once"
        & (Join-Path $PSScriptRoot "run-catalog-export.ps1")
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

if (-not (Test-Path $SupplierPyRoot)) {
    throw "supplier-py not found at $SupplierPyRoot - set -SupplierPyRoot"
}

$opsEnv = Join-Path $opsRoot "apps\worker\.env"
$supplierEnv = Join-Path $SupplierPyRoot ".env"
Sync-SupplierPyEnv -OpsEnvPath $opsEnv -SupplierEnvPath $supplierEnv

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
Invoke-Logged {
    & $python -m src.main scrape-supplier --supplier-config "configs/dealernetx.$Profile.yaml" --out "out/supplier_$Profile.csv"
}

Write-Host "[$(Get-Date -Format s)] pricing: match supplier vs Shopify"
Invoke-Logged {
    & $python -m src.main match --supplier "out/supplier_$Profile.csv" --shopify "out/shopify_variants.csv" --out "out/matches_$Profile.csv"
}

if ($IncludeReview) {
    Write-Host "[$(Get-Date -Format s)] pricing: review pack"
    Invoke-Logged {
        & $python -m src.main build-review-pack --matches "out/matches_$Profile.csv" --out-dir out/review --min-bucket high --top-n 250
    }
}

if ($IncludeAlerts) {
    Write-Host "[$(Get-Date -Format s)] pricing: add-alerts (max=$AlertMax)"
    Invoke-Logged {
        & $python -m src.main add-alerts --supplier-config "configs/dealernetx.$Profile.yaml" --matches "out/matches_$Profile.csv" --price-source suggested --min-priority-bucket high --max-alerts $AlertMax --execute
    }
}

Write-Host "[$(Get-Date -Format s)] pricing complete - see $SupplierPyRoot\out\matches_$Profile.csv"
if ($LogFile) { Write-Host "Log: $LogFile" }
