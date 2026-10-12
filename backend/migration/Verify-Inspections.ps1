# Only disposable schemas in the local test database; never cloud or live records.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$inspectionTestConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($inspectionTestConfig.host -ne 'localhost' -or $inspectionTestConfig.port -ne 5432 -or $inspectionTestConfig.user -ne 'postgres') { throw 'Unexpected test connection.' }
$inspectionTestConnection=@{source='permit_system';host='localhost';port=5432;database='permit_system_test';user='postgres';password=(Unseal-Password $inspectionTestConfig.passwordDpapi)}
$inspectionTestStart=New-Object System.Diagnostics.ProcessStartInfo
$inspectionTestStart.FileName=(Get-Command node.exe).Source
$inspectionTestStart.Arguments='--test "'+(Join-Path $PSScriptRoot '../database/inspections.pg.test.cjs')+'"'
$inspectionTestStart.UseShellExecute=$false
$inspectionTestStart.CreateNoWindow=$true
$inspectionTestStart.RedirectStandardOutput=$true
$inspectionTestStart.RedirectStandardError=$true
$inspectionTestStart.EnvironmentVariables['DB_ENGINE']='postgres'
$inspectionTestStart.EnvironmentVariables['PERMIT_DATABASE_URL']=''
$inspectionTestStart.EnvironmentVariables['QUEUE_DATABASE_URL']=''
$inspectionTestStart.EnvironmentVariables['OFFICE_PG_CONNECTIONS']=ConvertTo-Json -InputObject @($inspectionTestConnection) -Compress
$inspectionTestProcess=New-Object System.Diagnostics.Process
$inspectionTestProcess.StartInfo=$inspectionTestStart
try {
    [void]$inspectionTestProcess.Start()
    $inspectionTestStart.EnvironmentVariables.Remove('OFFICE_PG_CONNECTIONS')
    $inspectionTestConnection=$null
    $inspectionTestOutput=$inspectionTestProcess.StandardOutput.ReadToEndAsync()
    $inspectionTestErrors=$inspectionTestProcess.StandardError.ReadToEndAsync()
    $inspectionTestProcess.WaitForExit()
    Write-Output $inspectionTestOutput.GetAwaiter().GetResult()
    Write-Output $inspectionTestErrors.GetAwaiter().GetResult()
    if($inspectionTestProcess.ExitCode -ne 0){throw 'Inspection verification failed.'}
} finally {$inspectionTestProcess.Dispose();$inspectionTestConnection=$null;$inspectionTestConfig=$null}
