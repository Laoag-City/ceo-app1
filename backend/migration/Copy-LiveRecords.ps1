# Reads DPAPI credentials locally and passes them only to the child process environment.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\postgres-common.ps1"
$config = Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($config.host -ne 'localhost' -or $config.port -ne 5432 -or $config.user -ne 'postgres') { throw 'Unexpected migration connection.' }
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = (Get-Command node.exe).Source
$start.Arguments = '"' + "$PSScriptRoot\copy-live-records.cjs" + '"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.EnvironmentVariables['MIGRATION_PG_PASSWORD'] = Unseal-Password $config.passwordDpapi
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $start
try {
    [void]$process.Start()
    $start.EnvironmentVariables.Remove('MIGRATION_PG_PASSWORD')
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    Write-Output $outputTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'Live copy failed; inspect the metadata-only transfer report before retrying.' }
} finally { $start.EnvironmentVariables.Remove('MIGRATION_PG_PASSWORD'); $process.Dispose() }
