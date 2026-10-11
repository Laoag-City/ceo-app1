param([ValidateSet('permit','queue','tests')][string]$Service='permit')
# Foreground server. Ctrl+C stops this preview only. No machine-wide environment changes.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$apps=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
$connections=@($apps.connections | ForEach-Object {
    $source=if($_.database -eq 'permit_system_migration'){'permit_system'}elseif($_.database -eq 'queue_system_migration'){'queue_system'}else{throw 'Unexpected database'}
    @{source=$source;host=$_.host;port=$_.port;database=$(if($Service -eq 'tests'){"${source}_test"}else{$_.database});user=$_.user;password=(Unseal-Password $_.passwordDpapi)}
})
$file=switch($Service){'permit'{Join-Path $PSScriptRoot '..\monitorBP backend\monitorServer.js'} 'queue'{Join-Path $PSScriptRoot '..\queue backend\queueServer.js'} 'tests'{Join-Path $PSScriptRoot '..\database\postgres.integration.cjs'}}
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=(Get-Command node.exe).Source
$start.Arguments='"'+$file+'"'
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.EnvironmentVariables['DB_ENGINE']='postgres'
$start.EnvironmentVariables['TZ']='Asia/Manila'
$start.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=($connections | ConvertTo-Json -Compress)
$start.EnvironmentVariables['PERMIT_PORT']='3001'
$start.EnvironmentVariables['QUEUE_PORT']='5001'
$start.EnvironmentVariables['PERMIT_COOKIE_NAME']='permit_pg_preview'
$start.EnvironmentVariables['QUEUE_COOKIE_NAME']='queue_pg_preview'
$start.EnvironmentVariables['OFFICE_BIND_HOST']='127.0.0.1'
$start.EnvironmentVariables['OFFICE_PG_PREVIEW']='1'
$process=New-Object System.Diagnostics.Process
$process.StartInfo=$start
try {
 [void]$process.Start()
 $start.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
 $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
 Write-Output "PostgreSQL $Service process started (PID $($process.Id)). Preview ports: permit 3001, queue 5001."
 $process.WaitForExit()
 Write-Output $out.GetAwaiter().GetResult()
 Write-Output $err.GetAwaiter().GetResult()
 if($process.ExitCode -ne 0){throw "PostgreSQL $Service process failed."}
} finally {if(!$process.HasExited){$process.Kill()};$process.Dispose();$connections=$null}
