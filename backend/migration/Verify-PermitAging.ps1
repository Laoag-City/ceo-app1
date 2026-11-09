# Only disposable schemas in the local test database; never cloud or live records.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$duplicateTestConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($duplicateTestConfig.host -ne 'localhost' -or $duplicateTestConfig.port -ne 5432 -or $duplicateTestConfig.user -ne 'postgres') { throw 'Unexpected test connection.' }
$duplicateTestConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $duplicateTestConfig.passwordDpapi)}
$duplicateTestStart=New-Object System.Diagnostics.ProcessStartInfo
$duplicateTestStart.FileName=(Get-Command node.exe).Source
$duplicateTestStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/permit-aging.pg.test.cjs')+'"'
$duplicateTestStart.UseShellExecute=$false
$duplicateTestStart.CreateNoWindow=$true
$duplicateTestStart.RedirectStandardOutput=$true
$duplicateTestStart.RedirectStandardError=$true
$duplicateTestStart.EnvironmentVariables['DB_ENGINE']='postgres'
$duplicateTestStart.EnvironmentVariables['PERMIT_DATABASE_URL']=''
$duplicateTestStart.EnvironmentVariables['QUEUE_DATABASE_URL']=''
$duplicateTestStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($duplicateTestConnection) -Compress
$duplicateTestProcess=New-Object System.Diagnostics.Process
$duplicateTestProcess.StartInfo=$duplicateTestStart
try {
    [void]$duplicateTestProcess.Start()
    $duplicateTestStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
    $duplicateTestConnection=$null
    $duplicateTestOutput=$duplicateTestProcess.StandardOutput.ReadToEndAsync()
    $duplicateTestErrors=$duplicateTestProcess.StandardError.ReadToEndAsync()
    $duplicateTestProcess.WaitForExit()
    Write-Output $duplicateTestOutput.GetAwaiter().GetResult()
    Write-Output $duplicateTestErrors.GetAwaiter().GetResult()
    if($duplicateTestProcess.ExitCode -ne 0){throw 'Permit aging verification failed.'}
} finally {$duplicateTestProcess.Dispose();$duplicateTestConnection=$null;$duplicateTestConfig=$null}
