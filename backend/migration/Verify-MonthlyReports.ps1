# Only disposable schemas in the local test database; never cloud or live records.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$monthlyTestConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($monthlyTestConfig.host -ne 'localhost' -or $monthlyTestConfig.port -ne 5432 -or $monthlyTestConfig.user -ne 'postgres') { throw 'Unexpected test connection.' }
$monthlyTestConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $monthlyTestConfig.passwordDpapi)}
$monthlyTestStart=New-Object System.Diagnostics.ProcessStartInfo
$monthlyTestStart.FileName=(Get-Command node.exe).Source
$monthlyTestStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/monthly-reports.pg.test.cjs')+'"'
$monthlyTestStart.UseShellExecute=$false
$monthlyTestStart.CreateNoWindow=$true
$monthlyTestStart.RedirectStandardOutput=$true
$monthlyTestStart.RedirectStandardError=$true
$monthlyTestStart.EnvironmentVariables['DB_ENGINE']='postgres'
$monthlyTestStart.EnvironmentVariables['PERMIT_DATABASE_URL']=''
$monthlyTestStart.EnvironmentVariables['QUEUE_DATABASE_URL']=''
$monthlyTestStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($monthlyTestConnection) -Compress
$monthlyTestProcess=New-Object System.Diagnostics.Process
$monthlyTestProcess.StartInfo=$monthlyTestStart
try {
    [void]$monthlyTestProcess.Start()
    $monthlyTestStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
    $monthlyTestConnection=$null
    $monthlyTestOutput=$monthlyTestProcess.StandardOutput.ReadToEndAsync()
    $monthlyTestErrors=$monthlyTestProcess.StandardError.ReadToEndAsync()
    $monthlyTestProcess.WaitForExit()
    Write-Output $monthlyTestOutput.GetAwaiter().GetResult()
    Write-Output $monthlyTestErrors.GetAwaiter().GetResult()
    if($monthlyTestProcess.ExitCode -ne 0){throw 'Monthly reporting verification failed.'}
} finally {$monthlyTestProcess.Dispose();$monthlyTestConnection=$null;$monthlyTestConfig=$null}
