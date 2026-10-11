param([ValidateSet('queue_system_migration','queue_system_test')][string]$Database='queue_system_migration')
# Add durable client history without clearing tickets, sessions, or media.
# Runtime startup validates the schema; only this owner migration can create it.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$config=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($config.host -ne 'localhost' -or $config.port -ne 5432 -or $config.user -ne 'postgres') {
    throw 'Unexpected migration connection.'
}
$password=Unseal-Password $config.passwordDpapi
try {
    Invoke-Postgres $Database 'postgres' $password (Get-Content -LiteralPath "$PSScriptRoot\queue-runtime.sql" -Raw)
    Write-Output "Client history schema is ready in $Database. Existing queue records were retained."
} finally { $password=$null }
