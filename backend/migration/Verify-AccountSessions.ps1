# Verify exclusive account sessions in a fresh, disposable schema in the test DB.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$sessionConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$sessionConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $sessionConfig.passwordDpapi)}
$sessionStart=New-Object System.Diagnostics.ProcessStartInfo
$sessionStart.FileName=(Get-Command node.exe).Source
$sessionStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/account-sessions.pg.test.cjs')+'"'
$sessionStart.UseShellExecute=$false
$sessionStart.CreateNoWindow=$true
$sessionStart.RedirectStandardOutput=$true
$sessionStart.RedirectStandardError=$true
$sessionStart.EnvironmentVariables['DB_ENGINE']='postgres'
$sessionStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($sessionConnection) -Compress
$sessionProcess=New-Object System.Diagnostics.Process
$sessionProcess.StartInfo=$sessionStart
try {
 [void]$sessionProcess.Start()
 $sessionStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
 $sessionConnection=$null
 $sessionOutput=$sessionProcess.StandardOutput.ReadToEndAsync()
 $sessionErrors=$sessionProcess.StandardError.ReadToEndAsync()
 $sessionProcess.WaitForExit()
 Write-Output $sessionOutput.GetAwaiter().GetResult()
 Write-Output $sessionErrors.GetAwaiter().GetResult()
 if($sessionProcess.ExitCode -ne 0){throw 'Account session verification failed.'}
} finally {$sessionProcess.Dispose();$sessionConnection=$null;$sessionConfig=$null}
