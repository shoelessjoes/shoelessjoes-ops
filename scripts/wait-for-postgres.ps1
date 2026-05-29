param(
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    $r = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
    if ($r.TcpTestSucceeded) {
        Write-Host "Postgres port open on ${HostName}:${Port}"
        exit 0
    }
    Start-Sleep -Seconds 2
}

Write-Error "Timed out waiting for ${HostName}:${Port}"
exit 1
