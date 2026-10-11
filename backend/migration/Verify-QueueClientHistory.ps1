# Read-only check using the same runtime role and SQL adapter as the queue server.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$apps=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
$queueConfig=@($apps.connections | Where-Object { $_.database -eq 'queue_system_migration' })
if ($queueConfig.Count -ne 1 -or $queueConfig[0].host -ne 'localhost' -or $queueConfig[0].port -ne 5432 -or $queueConfig[0].user -ne 'queue_app_migration') {throw 'Unexpected queue verification connection.'}
$connection=@{source='queue_system';host=$queueConfig[0].host;port=$queueConfig[0].port;database=$queueConfig[0].database;user=$queueConfig[0].user;password=(Unseal-Password $queueConfig[0].passwordDpapi)}
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=(Get-Command node.exe).Source
$start.Arguments='"'+(Join-Path $PSScriptRoot 'verify-queue-client-history.cjs')+'"'
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.EnvironmentVariables['DB_ENGINE']='postgres'
$start.EnvironmentVariables['TZ']='Asia/Manila'
$start.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($connection) -Compress
$process=New-Object System.Diagnostics.Process
$process.StartInfo=$start
try {
    [void]$process.Start()
    $start.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
    $connection=$null
    $out=$process.StandardOutput.ReadToEndAsync()
    $err=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    Write-Output $out.GetAwaiter().GetResult()
    Write-Output $err.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {throw 'Client history verification failed.'}
} finally {$process.Dispose();$connection=$null}
