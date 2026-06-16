param(
    [string]$ActiveStockMorning = "06:00",
    [string]$ActiveStockAfternoon = "12:00",
    [string]$ActiveStockEvening = "18:00",
    [string]$PricingDaily = "07:00",
    [string]$PricingWeekly = "07:30",
    [string]$PollMessagesEveryMinutes = 30,
    [string]$SupplierPyRoot = "C:\Users\burke\Git2\shoelessjoes-supplier-py"
)

$ErrorActionPreference = "Stop"
$opsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$activeCmd = (Resolve-Path (Join-Path $PSScriptRoot "scheduled\active-stock.cmd")).Path
$pricingDailyCmd = (Resolve-Path (Join-Path $PSScriptRoot "scheduled\dealernet-pricing-daily.cmd")).Path
$pricingWeeklyCmd = (Resolve-Path (Join-Path $PSScriptRoot "scheduled\dealernet-pricing-weekly.cmd")).Path
$pollCmd = (Resolve-Path (Join-Path $PSScriptRoot "scheduled\poll-messages.cmd")).Path

function Invoke-Schtasks {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & schtasks @Args | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks failed" }
}

function Register-OrReplaceTask {
    param([string]$TaskName, [string]$Schedule, [string]$StartTime, [string]$TaskRun, [int]$Modifier = 1)
    & schtasks /Query /TN $TaskName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Invoke-Schtasks -Args @("/Delete", "/TN", $TaskName, "/F") }
    Invoke-Schtasks -Args @("/Create", "/TN", $TaskName, "/TR", $TaskRun, "/SC", $Schedule, "/ST", $StartTime, "/MO", "$Modifier", "/RL", "LIMITED", "/F")
    Write-Host "Registered: $TaskName @ $StartTime"
}

Register-OrReplaceTask -TaskName "ShoelessJoes-ActiveStock-Morning" -Schedule "DAILY" -StartTime $ActiveStockMorning -TaskRun $activeCmd
Register-OrReplaceTask -TaskName "ShoelessJoes-ActiveStock-Afternoon" -Schedule "DAILY" -StartTime $ActiveStockAfternoon -TaskRun $activeCmd
Register-OrReplaceTask -TaskName "ShoelessJoes-ActiveStock-Evening" -Schedule "DAILY" -StartTime $ActiveStockEvening -TaskRun $activeCmd
Register-OrReplaceTask -TaskName "ShoelessJoes-DealernetPricing-Daily" -Schedule "DAILY" -StartTime $PricingDaily -TaskRun $pricingDailyCmd
Register-OrReplaceTask -TaskName "ShoelessJoes-DealernetPricing-Weekly" -Schedule "WEEKLY" -StartTime $PricingWeekly -TaskRun $pricingWeeklyCmd
Register-OrReplaceTask -TaskName "ShoelessJoes-PollMessages" -Schedule "MINUTE" -StartTime "00:00" -TaskRun $pollCmd -Modifier $PollMessagesEveryMinutes

Write-Host ""
Write-Host "Ops schedules registered (Dealernet + Shopify focus)."
Write-Host "  Active stock 3x/day: ingest, poll, purchase dry-run (no Shopify export)"
Write-Host "  Catalog export: weekly via dealernet-pricing-weekly (-IncludeCatalogExport)"
Write-Host "  Poll messages every ${PollMessagesEveryMinutes}m: inbox -> email digest (replaces SMS login)"
Write-Host "  Pricing daily: Dealernet table vs Shopify UPCs (in-stock profile)"
Write-Host "  Pricing weekly: full barcode pass + review pack (no price-alert posts unless you add -IncludeAlerts)"
Write-Host ""
Write-Host "Requires apps/worker/.env: DATABASE_URL, SHOPIFY_*, DEALERNET_*, CATALOG_PRODUCT_TYPES"
Write-Host "Requires supplier-py at: $SupplierPyRoot"
