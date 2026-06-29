# Refresh Shopify catalog + scrape Midwest presells + dry-run draft import.
#
# CDP mode (recommended — avoids Cloudflare verify loop):
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\burke\Git2\shoelessjoes-ops\scripts\midwest-presell-sync.ps1 -UseCdp
#
# Catalog only:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\burke\Git2\shoelessjoes-ops\scripts\midwest-presell-sync.ps1 -CatalogOnly

param(
    [switch]$CatalogOnly,
    [switch]$SkipScrape,
    [switch]$ExecuteImport,
    [switch]$UseCdp,
    [string]$Categories = "https://www.midwestcards.com/baseball-cards/?Availability=Presell"
)

$ErrorActionPreference = "Stop"

$OpsRoot         = "C:\Users\burke\Git2\shoelessjoes-ops"
$Python          = "C:\Users\burke\Git2\shoelessjoes-supplier-py\.venv\Scripts\python.exe"
$ScrapeScript    = "C:\Users\burke\Git2\shoelessjoes-supplier-py\scripts\scrape-midwestcards-presells.py"
$LaunchChromePs1 = "C:\Users\burke\Git2\shoelessjoes-supplier-py\scripts\launch-chrome-for-midwest.ps1"
$CatalogCsv      = "C:\Users\burke\Git2\shoelessjoes-ops\data\sealed-catalog.csv"
$PresellJson     = "C:\Users\burke\Git2\shoelessjoes-supplier-py\out\midwest_presells.json"
$PresellCsv      = "C:\Users\burke\Git2\shoelessjoes-supplier-py\out\midwest_presells.csv"
$CdpUrl          = "http://127.0.0.1:9222"

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
    if ($UseCdp) {
        Write-Host "=== 2a) Launch real Chrome for Cloudflare (manual verify) ===" -ForegroundColor Cyan
        Write-Host "If Chrome is already open on the Midwest profile with CF passed, skip this step." -ForegroundColor Yellow
        & powershell -NoProfile -ExecutionPolicy Bypass -File $LaunchChromePs1
        Read-Host "Press Enter after Cloudflare is passed and Midwest Cards loads normally"
    }

    Write-Host "=== 2b) Scrape Midwest presell categories ===" -ForegroundColor Cyan
    $scrapeArgs = @(
        $ScrapeScript,
        "--max-pages", "10",
        "--categories", $Categories,
        "--catalog", $CatalogCsv,
        "--out", $PresellCsv,
        "--json-out", $PresellJson
    )
    if ($UseCdp) {
        $scrapeArgs += @("--cdp-url", $CdpUrl)
    }
    else {
        $scrapeArgs += @("--headed", "--manual-cf", "--channel", "chrome")
    }
    & $Python @scrapeArgs
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
