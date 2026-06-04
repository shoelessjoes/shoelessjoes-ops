param(
    [string]$MorningTime = "06:30",
    [string]$AfternoonTime = "14:00",
    [string]$EveningTime = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cmd = (Resolve-Path (Join-Path $PSScriptRoot "scheduled\vending-price-check.cmd")).Path

function Invoke-Schtasks {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & schtasks @Args | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks failed: schtasks $($Args -join ' ')"
    }
}

function Register-OrReplaceTask {
    param(
        [string]$TaskName,
        [string]$Schedule,
        [string]$StartTime,
        [string]$TaskRun,
        [int]$Modifier = 1
    )

    & schtasks /Query /TN $TaskName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Invoke-Schtasks -Args @("/Delete", "/TN", $TaskName, "/F")
    }

    $createArgs = @(
        "/Create", "/TN", $TaskName,
        "/TR", $TaskRun,
        "/SC", $Schedule,
        "/ST", $StartTime,
        "/MO", "$Modifier",
        "/RL", "LIMITED",
        "/F"
    )
    Invoke-Schtasks -Args $createArgs
    Write-Host "Registered: $TaskName ($Schedule @ $StartTime)"
}

Register-OrReplaceTask -TaskName "ShoelessJoes-VendingPriceCheck-Morning" -Schedule "DAILY" -StartTime $MorningTime -TaskRun $cmd
Register-OrReplaceTask -TaskName "ShoelessJoes-VendingPriceCheck-Afternoon" -Schedule "DAILY" -StartTime $AfternoonTime -TaskRun $cmd

if ($EveningTime) {
    Register-OrReplaceTask -TaskName "ShoelessJoes-VendingPriceCheck-Evening" -Schedule "DAILY" -StartTime $EveningTime -TaskRun $cmd
}

Write-Host ""
Write-Host "Vending price check tasks registered."
Write-Host "Project: $projectRoot"
Write-Host "Command: $cmd"
Write-Host ""
Write-Host "Requires apps/worker/.env with DATABASE_URL, SHOPIFY_*, ZHONGDA_*, CATALOG_PRODUCT_TYPES"
Write-Host "Optional: VENDING_PRICE_CHECK_EMAIL=1 and ALERT_* for email on mismatches"
Write-Host "Optional: VENDING_REPORT_IN_STOCK_ONLY=1 to only flag items with Shopify qty > 0"
