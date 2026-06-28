# Refresh Shopify catalog + scrape Midwest presells + dry-run draft import.
# Run from anywhere. Requires apps/worker/.env with Shopify credentials.
#
# Examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\burke\Git2\shoelessjoes-ops\scripts\midwest-presell-sync.ps1 -WarmupOnly
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\burke\Git2\shoelessjoes-ops\scripts\midwest-presell-sync.ps1 -CatalogOnly
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\burke\Git2\shoelessjoes-ops\scripts\midwest-presell-sync.ps1

param(
    [switch]$CatalogOnly,
    [switch]$SkipScrape,
    [switch]$ExecuteImport,
    [switch]$WarmupOnly,
    [string]$Categories = "https://www.midwestcards.com/baseball-cards/?Availability=Presell"
)

$ErrorActionPreference = "Stop"

$OpsRoot        = "C:\Users\burke\Git2\shoelessjoes-ops"
$Python         = "C:\Users\burke\Git2\shoelessjoes-supplier-py\.venv\Scripts\python.exe"
$ScrapeScript   = "C:\Users\burke\Git2\shoelessjoes-supplier-py\scripts\scrape-midwestcards-presells.py"
$WarmupScript   = "C:\Users\burke\Git2\shoelessjoes-supplier-py\scripts\warmup-midwest-browser.py"
$CatalogCsv     = "C:\Users\burke\Git2\shoelessjoes-ops\data\sealed-catalog.csv"
$PresellJson    = "C:\Users\burke\Git2\shoelessjoes-supplier-py\out\midwest_presells.json"
$PresellCsv     = "C:\Users\burke\Git2\shoelessjoes-supplier-py\out\midwest_presells.csv"
$BrowserProfile = "C:\Users\burke\Git2\shoelessjoes-supplier-py\out\mwc-browser-profile"

if ($WarmupOnly) {
    Write-Host "=== Cloudflare warmup (one-time or when blocked) ===" -ForegroundColor Cyan
    & $Python $WarmupScript --headed --channel chrome --browser-profile $BrowserProfile
    if ($LASTEXITCODE -ne 0) { throw "warmup-midwest-browser failed with exit code $LASTEXITCODE" }
    exit 0
}

Write-Host "=== 1) Export sealed catalog from Shopify -> ProductCatalog + CSV ===" -ForegroundColor Cyan
Push-Location $OpsRoot
try {
    npm run job:export-catalog
    if ($LASTEXITCODE -ne 0) { throw "export-catalog failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

if ($CatalogOnly) {
    Write-Host "CatalogOnly set; done." -ForegroundColor Green
    exit 0
}

if (-not $SkipScrape) {
    Write-Host "=== 2) Scrape Midwest presell categories (headed + Chrome profile) ===" -ForegroundColor Cyan
    & $Python $ScrapeScript `
        --headed `
        --manual-cf `
        --channel chrome `
        --browser-profile $BrowserProfile `
        --max-pages 10 `
        --categories $Categories `
        --catalog $CatalogCsv `
        --out $PresellCsv `
        --json-out $PresellJson
    if ($LASTEXITCODE -ne 0) { throw "scrape-midwestcards-presells failed with exit code $LASTEXITCODE" }
}

Write-Host "=== 3) Import Midwest drafts (dry-run unless -ExecuteImport) ===" -ForegroundColor Cyan
Push-Location $OpsRoot
try {
    if ($ExecuteImport) {
        npm run job:import-midwest-drafts -- --execute --json=$PresellJson
    }
    else {
        npm run job:import-midwest-drafts -- --json=$PresellJson
    }
    if ($LASTEXITCODE -ne 0) { throw "import-midwest-drafts failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host "Done." -ForegroundColor Green
