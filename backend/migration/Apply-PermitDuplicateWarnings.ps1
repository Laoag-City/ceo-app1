param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$duplicateConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if($duplicateConfig.host -ne 'localhost' -or $duplicateConfig.port -ne 5432 -or $duplicateConfig.user -ne 'postgres'){throw 'Unexpected local migration connection.'}
$duplicatePassword=Unseal-Password $duplicateConfig.passwordDpapi
try {
    $duplicateSql="BEGIN;`n"+(Get-Content -LiteralPath "$PSScriptRoot\permit-creation-requests.sql" -Raw)+"`nGRANT SELECT,INSERT ON public.permit_creation_requests TO permit_app_migration;`nCOMMIT;"
    Invoke-Postgres $Database 'postgres' $duplicatePassword $duplicateSql
    Write-Output "Permit creation retry protection is ready in $Database. Existing records were retained."
}finally{$duplicatePassword=$null;$duplicateConfig=$null}
