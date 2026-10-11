# Creates independent test clones without modifying copied application records.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$config=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$password=Unseal-Password $config.passwordDpapi
try {
    Invoke-Postgres 'queue_system_migration' 'postgres' $password (Get-Content "$PSScriptRoot\queue-runtime.sql" -Raw)
    $start=New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName=(Get-Command node.exe).Source
    $start.Arguments='"'+"$PSScriptRoot\create-test-databases.cjs"+'"'
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.EnvironmentVariables['MIGRATION_PG_PASSWORD']=$password
    $process=New-Object System.Diagnostics.Process;$process.StartInfo=$start
    [void]$process.Start();$start.EnvironmentVariables.Remove('MIGRATION_PG_PASSWORD')
    $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit();Write-Output $out.GetAwaiter().GetResult();Write-Output $err.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0){throw 'Test database setup failed. Inspect before retrying.'}
} finally {$password=$null}
