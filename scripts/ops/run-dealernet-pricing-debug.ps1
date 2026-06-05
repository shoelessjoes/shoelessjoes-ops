# Run pricing pipeline and save full output (including tracebacks) to data/pricing-run.log
$ErrorActionPreference = "Stop"
$opsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$log = Join-Path $opsRoot "data\pricing-run.log"
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
"=== pricing run $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
& (Join-Path $PSScriptRoot "run-dealernet-pricing.ps1") -Profile daily -IncludeReview -LogFile $log @args
exit $LASTEXITCODE
