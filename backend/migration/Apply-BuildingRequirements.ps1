param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
# Local additive migration. No existing permit or occupancy records are changed.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$requirementsConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($requirementsConfig.host -ne 'localhost' -or $requirementsConfig.port -ne 5432 -or $requirementsConfig.user -ne 'postgres') { throw 'Unexpected migration connection.' }
$requirementsPassword=Unseal-Password $requirementsConfig.passwordDpapi
try {
    $requirementsSql="BEGIN;`n"+(Get-Content -LiteralPath "$PSScriptRoot\permit-checklists.sql" -Raw)+"`nGRANT SELECT,INSERT,UPDATE,DELETE ON public.permit_checklists TO permit_app_migration;`nGRANT USAGE,SELECT ON SEQUENCE public.permit_checklists_id_seq TO permit_app_migration;`nCOMMIT;"
    Invoke-Postgres $Database 'postgres' $requirementsPassword $requirementsSql
    Write-Output "Building requirements schema is ready in $Database. Existing records were retained."
} finally { $requirementsPassword=$null; $requirementsConfig=$null }
