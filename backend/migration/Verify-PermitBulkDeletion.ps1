# Test the real deletion workflow using temporary tables in the test database.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$bulkTestConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$bulkTestConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $bulkTestConfig.passwordDpapi)}
$bulkTestStart=New-Object System.Diagnostics.ProcessStartInfo
$bulkTestStart.FileName=(Get-Command node.exe).Source
$bulkTestStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/bulk-deletion.pg.test.cjs')+'"'
$bulkTestStart.UseShellExecute=$false
$bulkTestStart.CreateNoWindow=$true
$bulkTestStart.RedirectStandardOutput=$true
$bulkTestStart.RedirectStandardError=$true
$bulkTestStart.EnvironmentVariables['DB_ENGINE']='postgres'
$bulkTestStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($bulkTestConnection) -Compress
$bulkTestProcess=New-Object System.Diagnostics.Process
$bulkTestProcess.StartInfo=$bulkTestStart
try {
 [void]$bulkTestProcess.Start()
 $bulkTestStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
 $bulkTestConnection=$null
 $bulkTestOutput=$bulkTestProcess.StandardOutput.ReadToEndAsync()
 $bulkTestErrors=$bulkTestProcess.StandardError.ReadToEndAsync()
 $bulkTestProcess.WaitForExit()
 Write-Output $bulkTestOutput.GetAwaiter().GetResult()
 Write-Output $bulkTestErrors.GetAwaiter().GetResult()
 if($bulkTestProcess.ExitCode -ne 0){throw 'Permit bulk deletion verification failed.'}
}finally{$bulkTestProcess.Dispose();$bulkTestConnection=$null;$bulkTestConfig=$null}
