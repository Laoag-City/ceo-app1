param([ValidateSet('queue_system_migration','queue_system_test')][string]$Database='queue_system_migration')
# Add reporting timestamps and playlist order. Retain tickets, history, and media.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$queueFeatureConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($queueFeatureConfig.host -ne 'localhost' -or $queueFeatureConfig.port -ne 5432 -or $queueFeatureConfig.user -ne 'postgres') {
 throw 'Unexpected migration connection.'
}
$queueFeaturePassword=Unseal-Password $queueFeatureConfig.passwordDpapi
try {
 foreach($queueFeatureFile in @('queue-runtime.sql','queue-playlist.sql','queue-service-only-intake.sql')) {
  Invoke-Postgres $Database 'postgres' $queueFeaturePassword (Get-Content -LiteralPath (Join-Path $PSScriptRoot $queueFeatureFile) -Raw)
 }
 Write-Output "Queue reports and playlist schema are ready in $Database. Existing records were retained."
} finally { $queueFeaturePassword=$null;$queueFeatureConfig=$null }
