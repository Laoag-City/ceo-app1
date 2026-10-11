# Post-commit count/identity verification as limited runtime users.
# Full field-by-field comparison is performed before commit by copy-live-records.cjs.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\postgres-common.ps1"
$reportPath = "$PSScriptRoot\postgres-live-transfer.json"
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
if ($report.status -ne 'passed') { throw 'A successful live transfer report is required.' }
$apps = Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
foreach ($database in $report.databases) {
    if ($database.target -notin @('permit_system_migration','queue_system_migration')) { throw 'Unexpected target.' }
    $connection = $apps.connections | Where-Object { $_.database -eq $database.target }
    $password = Unseal-Password $connection.passwordDpapi
    try {
        foreach ($table in $database.tables) {
            if ($table.table -notmatch '^[a-z_]+$') { throw 'Invalid table identifier.' }
            $count = Invoke-Postgres $database.target $connection.user $password "SELECT count(*) FROM public.$($table.table);"
            if ([long]$count -ne $table.copiedRows) { throw "Count mismatch: $($table.table)" }
            if ($table.nextId) {
                $sequence = Invoke-Postgres $database.target $connection.user $password "SELECT pg_get_serial_sequence('public.$($table.table)','id');"
                if ($sequence -notmatch '^public\.[a-z_]+$') { throw 'Unexpected sequence.' }
                $state = Invoke-Postgres $database.target $connection.user $password "SELECT last_value::text || '|' || is_called::text FROM $sequence;"
                if ($state -ne "$($table.nextId)|false") { throw "Identity mismatch: $($table.table)" }
            }
        }
        Write-Output "$($database.target): committed counts and next IDs verified through runtime account."
    } finally { $password = $null }
}
$report | Add-Member -NotePropertyName postCommitVerifiedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding UTF8
