param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
# Local, additive owner migration. Existing permit records and sessions remain.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$inspectionConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($inspectionConfig.host -ne 'localhost' -or $inspectionConfig.port -ne 5432 -or $inspectionConfig.user -ne 'postgres') { throw 'Unexpected migration connection.' }
$inspectionPassword=Unseal-Password $inspectionConfig.passwordDpapi
try {
    $inspectionSql="BEGIN;`n"+(Get-Content -LiteralPath "$PSScriptRoot\permit-inspections.sql" -Raw)+"`nGRANT SELECT,INSERT,UPDATE,DELETE ON public.permit_inspections TO permit_app_migration;`nGRANT USAGE,SELECT ON SEQUENCE public.permit_inspections_id_seq TO permit_app_migration;`nCOMMIT;"
    Invoke-Postgres $Database 'postgres' $inspectionPassword $inspectionSql
    Write-Output "Building inspection schema is ready in $Database. Existing records were retained."
} finally { $inspectionPassword=$null; $inspectionConfig=$null }
