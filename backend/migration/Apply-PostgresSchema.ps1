# Step 2: isolated empty schemas only. Existing tables cause an atomic refusal.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\postgres-common.ps1"
$config = Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if ($config.host -ne 'localhost' -or $config.port -ne 5432 -or $config.user -ne 'postgres') { throw 'Unexpected migration connection.' }
$password = Unseal-Password $config.passwordDpapi
try {
    foreach ($database in @('permit_system_migration', 'queue_system_migration')) {
        $sql = Get-Content -LiteralPath "$PSScriptRoot\$database.sql" -Raw
        Invoke-Postgres $database 'postgres' $password $sql
        Write-Output "Created empty schema: $database"
    }
} finally { $password = $null }
