param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$contactConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if($contactConfig.host -ne 'localhost' -or $contactConfig.port -ne 5432 -or $contactConfig.user -ne 'postgres'){throw 'Unexpected migration connection.'}
$contactPassword=Unseal-Password $contactConfig.passwordDpapi
try {
    Invoke-Postgres $Database 'postgres' $contactPassword (Get-Content -LiteralPath "$PSScriptRoot\permit-contacts.sql" -Raw)
    Write-Output "Permit contact columns are ready in $Database. Existing records were retained."
} finally {$contactPassword=$null;$contactConfig=$null}
