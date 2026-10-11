# Exercise the real queue transitions against temporary tables in the test database.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$queueTestConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$queueTestConnection=@{source='queue_system';host='localhost';port=5432;database='queue_system_test';user='postgres';password=(Unseal-Password $queueTestConfig.passwordDpapi)}
$queueTestStart=New-Object System.Diagnostics.ProcessStartInfo
$queueTestStart.FileName=(Get-Command node.exe).Source
$queueTestStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../queue backend/queue-flow.test.cjs')+'" "'+(Join-Path $PSScriptRoot '../queue backend/queue-auth.test.cjs')+'" "'+(Join-Path $PSScriptRoot '../queue backend/queue-reports.pg.test.cjs')+'"'
$queueTestStart.UseShellExecute=$false
$queueTestStart.CreateNoWindow=$true
$queueTestStart.RedirectStandardOutput=$true
$queueTestStart.RedirectStandardError=$true
$queueTestStart.EnvironmentVariables['DB_ENGINE']='postgres'
$queueTestStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($queueTestConnection) -Compress
$queueTestProcess=New-Object System.Diagnostics.Process
$queueTestProcess.StartInfo=$queueTestStart
try {
 [void]$queueTestProcess.Start()
 $queueTestStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
 $queueTestConnection=$null
 $queueTestOutput=$queueTestProcess.StandardOutput.ReadToEndAsync()
 $queueTestErrors=$queueTestProcess.StandardError.ReadToEndAsync()
 $queueTestProcess.WaitForExit()
 Write-Output $queueTestOutput.GetAwaiter().GetResult()
 Write-Output $queueTestErrors.GetAwaiter().GetResult()
 if($queueTestProcess.ExitCode -ne 0){throw 'Queue window verification failed.'}
}finally{$queueTestProcess.Dispose();$queueTestConnection=$null;$queueTestConfig=$null}
