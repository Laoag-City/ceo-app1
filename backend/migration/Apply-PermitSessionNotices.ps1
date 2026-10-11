param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
# Add notification receipts without changing current sessions or permit records.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$config=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($config.host -ne 'localhost' -or $config.port -ne 5432 -or $config.user -ne 'postgres') { throw 'Unexpected migration connection.' }
$noticePassword=Unseal-Password $config.passwordDpapi
try {
 $sql="BEGIN;`n"+(Get-Content -LiteralPath "$PSScriptRoot\permit-session-notices.sql" -Raw)+"`nGRANT SELECT,INSERT,DELETE ON public.permit_session_replacements TO permit_app_migration;`nCOMMIT;"
 Invoke-Postgres $Database 'postgres' $noticePassword $sql
 Write-Output "Session notification schema is ready in $Database. Current sessions and permit records were retained."
} finally { $noticePassword=$null }
