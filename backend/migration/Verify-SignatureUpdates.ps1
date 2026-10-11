# Runs workflow tests using TEMP tables in the isolated PostgreSQL test database.
# The owner creates TEMP fixtures, then tests use the application's restricted role.
# Grants apply only to those TEMP fixtures; installed runtime privileges stay intact.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$signatureConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$signatureConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $signatureConfig.passwordDpapi)}
$signatureStart=New-Object System.Diagnostics.ProcessStartInfo
$signatureStart.FileName=(Get-Command node.exe).Source
$signatureStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/signature-updates.pg.test.cjs')+'"'
$signatureStart.UseShellExecute=$false
$signatureStart.CreateNoWindow=$true
$signatureStart.RedirectStandardOutput=$true
$signatureStart.RedirectStandardError=$true
$signatureStart.EnvironmentVariables['DB_ENGINE']='postgres'
$signatureStart.EnvironmentVariables['TZ']='Asia/Manila'
$signatureStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($signatureConnection) -Compress
$signatureProcess=New-Object System.Diagnostics.Process
$signatureProcess.StartInfo=$signatureStart
try {
 [void]$signatureProcess.Start()
 $signatureStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
 $signatureConnection=$null
 $signatureOutput=$signatureProcess.StandardOutput.ReadToEndAsync()
 $signatureErrors=$signatureProcess.StandardError.ReadToEndAsync()
 $signatureProcess.WaitForExit()
 Write-Output $signatureOutput.GetAwaiter().GetResult()
 Write-Output $signatureErrors.GetAwaiter().GetResult()
 if($signatureProcess.ExitCode -ne 0){throw 'Signature approval verification failed.'}
} finally {$signatureProcess.Dispose();$signatureConnection=$null;$signatureConfig=$null}
