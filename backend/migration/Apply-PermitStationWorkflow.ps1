param([ValidateSet('permit_system_migration','permit_system_test')][string]$Database='permit_system_migration')
# Add assignment and append-only final-review tables. Existing permits and history stay intact.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$stationConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if($stationConfig.host -ne 'localhost' -or $stationConfig.port -ne 5432 -or $stationConfig.user -ne 'postgres'){throw 'Unexpected migration connection.'}
$stationPassword=Unseal-Password $stationConfig.passwordDpapi
try {
 Invoke-Postgres $Database 'postgres' $stationPassword (Get-Content -LiteralPath "$PSScriptRoot\permit-station-workflow.sql" -Raw)
 Invoke-Postgres $Database 'postgres' $stationPassword (Get-Content -LiteralPath "$PSScriptRoot\permit-station-multiple.sql" -Raw)
 Write-Output "Station assignments and final review schema ready in $Database. Existing records retained."
} finally {$stationPassword=$null;$stationConfig=$null}
