$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\postgres-common.ps1"
$apps = Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
$inventory = Get-Content -LiteralPath "$PSScriptRoot\mysql-schema-inventory.json" -Raw | ConvertFrom-Json
$results = @()
foreach ($source in @('permit_system', 'queue_system')) {
    $database = "${source}_migration"
    $connection = @($apps.connections | Where-Object { $_.database -eq $database })
    if ($connection.Count -ne 1) { throw 'Missing unique runtime connection.' }
    $connection = $connection[0]
    $password = Unseal-Password $connection.passwordDpapi
    try {
        $expected = $inventory.databases.$source
        $rows = 0
        foreach ($table in $expected.tables) {
            $name = $table.TABLE_NAME
            if ($name -notmatch '^[a-z_]+$') { throw 'Unexpected table identifier.' }
            $rows += [int](Invoke-Postgres $database $connection.user $password "SELECT count(*) FROM public.$name;")
        }
        if ($rows -ne 0) { throw 'Schema verification requires empty tables.' }
        $query = @'
SELECT json_build_object(
 'tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
 'columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),
 'foreignKeys',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND contype='f'),
 'primaryKeys',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND contype='p'),
 'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public'),
 'identities',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND is_identity='YES'),
 'canCreate',has_schema_privilege(current_user,'public','CREATE'),
 'restricted',(SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user));
'@
        $actual = Invoke-Postgres $database $connection.user $password $query | ConvertFrom-Json
        $indexCount = @($expected.indexes | Group-Object TABLE_NAME,INDEX_NAME).Count
        $identityCount = @($expected.columns | Where-Object { $_.EXTRA -eq 'auto_increment' }).Count
        if ($actual.tables -ne $expected.tables.Count -or $actual.columns -ne $expected.columns.Count -or $actual.foreignKeys -ne @($expected.foreignKeys).Count -or $actual.primaryKeys -ne $expected.tables.Count -or $actual.indexes -ne $indexCount -or $actual.identities -ne $identityCount -or $actual.canCreate -or -not $actual.restricted) { throw "Metadata verification failed for $database" }
        $kind = if ($source -eq 'permit_system') { 'permit' } else { 'queue' }
        $fixture = Get-Content -LiteralPath "$PSScriptRoot\verify-$kind-schema.sql" -Raw
        $test = Invoke-Postgres $database $connection.user $password $fixture
        $results += [pscustomobject]@{database=$database; metadata=$actual; rows=0; fixtures=$test; status='passed'}
        Write-Output "$database verified: $($actual.tables) tables, $($actual.columns) columns, $($actual.foreignKeys) relationships; $test"
    } finally { $password = $null }
}
[pscustomobject]@{verifiedAt=(Get-Date).ToUniversalTime().ToString('o'); scope='Empty schemas only; no data transfer or backend cutover'; databases=$results} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$PSScriptRoot\postgres-schema-verification.json" -Encoding UTF8
