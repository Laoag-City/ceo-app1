param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$processingConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if($processingConfig.host -ne 'localhost' -or $processingConfig.port -ne 5432 -or $processingConfig.user -ne 'postgres'){throw 'Unexpected migration connection.'}
$processingPassword=Unseal-Password $processingConfig.passwordDpapi
try {
    Invoke-Postgres $Database 'postgres' $processingPassword (Get-Content -LiteralPath "$PSScriptRoot\permit-processing.sql" -Raw)
    Write-Output "Processing time columns ready in $Database. Existing permits were retained."
} finally {$processingPassword=$null;$processingConfig=$null}
