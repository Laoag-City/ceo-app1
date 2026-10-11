$ErrorActionPreference = 'Stop'
# Step 1 only: empty databases and non-administrator application logins.
# Passwords are passed through child-process environment/stdin, never command arguments.
$pgClient = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$pgConfigDirectory = Join-Path $env:USERPROFILE 'PermitManagementConfig'
$pgAdmin = Get-Content -LiteralPath (Join-Path $pgConfigDirectory 'postgres-migration.json') -Raw | ConvertFrom-Json
$pgRuntimeFile = Join-Path $pgConfigDirectory 'postgres-migration-apps.json'
if ($pgAdmin.host -ne 'localhost' -or $pgAdmin.user -ne 'postgres' -or [int]$pgAdmin.port -ne 5432) { throw 'Review the changed connection configuration before preparing databases.' }
if (Test-Path -LiteralPath $pgRuntimeFile) { throw 'Application connection settings already exist. Inspect the previous setup before running again; nothing was overwritten.' }

function Unseal-Password($encrypted) {
    $secret = ConvertTo-SecureString $encrypted
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
}
function Invoke-Postgres($database, $username, $password, $sql) {
    if ($database -notmatch '^[a-z_]+$' -or $username -notmatch '^[a-z_]+$') { throw 'Invalid connection identifier.' }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $pgClient
    $start.Arguments = "-X -w -q -A -t -h localhost -p 5432 -U $username -d $database -v ON_ERROR_STOP=1"
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables['PGPASSWORD'] = $password
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine($sql)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'PostgreSQL setup command failed. Output containing SQL or credentials was suppressed; inspect the setup before retrying.' }
        return $outTask.GetAwaiter().GetResult().Trim()
    } finally { $process.Dispose() }
}

$pgPassword = Unseal-Password $pgAdmin.passwordDpapi
try {
    $existing = Invoke-Postgres 'postgres' 'postgres' $pgPassword "SELECT count(*) FROM (SELECT datname AS name FROM pg_database WHERE datname IN ('permit_system_migration','queue_system_migration') UNION ALL SELECT rolname FROM pg_roles WHERE rolname IN ('permit_app_migration','queue_app_migration')) objects;"
    if ($existing -ne '0') { throw 'A target database or role already exists. Nothing was changed; inspect it before continuing.' }
    $connections = @()
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        foreach ($kind in @('permit','queue')) {
            $bytes = New-Object byte[] 32
            $rng.GetBytes($bytes)
            $password = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            $secret = ConvertTo-SecureString $password -AsPlainText -Force
            try {
                $connections += @{host='localhost';port=5432;database="${kind}_system_migration";user="${kind}_app_migration";passwordDpapi=(ConvertFrom-SecureString $secret)}
            } finally { $secret.Dispose(); $password = $null }
        }
    } finally { $rng.Dispose() }
    # Save encrypted credentials before server mutation so an interrupted setup
    # can be inspected and recovered without resetting any existing password.
    $json = @{status='preparing';connections=$connections} | ConvertTo-Json -Depth 4
    $stream = [IO.File]::Open($pgRuntimeFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $writer = New-Object IO.StreamWriter($stream)
    try { $writer.Write($json) } finally { $writer.Dispose() }
    foreach ($connection in $connections) {
        $name = $connection.database
        $role = $connection.user
        $runtimePassword = Unseal-Password $connection.passwordDpapi
        try {
            [void](Invoke-Postgres 'postgres' 'postgres' $pgPassword "CREATE ROLE $role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$runtimePassword';")
            [void](Invoke-Postgres 'postgres' 'postgres' $pgPassword "CREATE DATABASE $name OWNER postgres TEMPLATE template0 ENCODING 'UTF8';")
            [void](Invoke-Postgres 'postgres' 'postgres' $pgPassword "REVOKE ALL ON DATABASE $name FROM PUBLIC; GRANT CONNECT ON DATABASE $name TO $role;")
            [void](Invoke-Postgres $name 'postgres' $pgPassword "REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO $role;")
            $check = Invoke-Postgres $name $role $runtimePassword "SELECT current_database(),current_user,(SELECT count(*) FROM information_schema.tables WHERE table_schema='public'),rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_schema_privilege(current_user,'public','CREATE') FROM pg_roles WHERE rolname=current_user;"
            if ($check -ne "$name|$role|0|f|f|f|f|f|f") { throw 'Application connection or privilege verification did not match expectations.' }
            Write-Host "Verified: $name; login $role; zero application tables; no administrative or schema-create privileges."
        } finally { $runtimePassword = $null }
    }
    @{status='verified';verifiedAt=[DateTime]::UtcNow.ToString('o');connections=$connections} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pgRuntimeFile -Encoding UTF8
    Write-Host 'Step 1 complete. MySQL and application configuration were not changed.'
} finally { $pgPassword = $null }
