$ErrorActionPreference = 'Stop'
# Run locally by the user. Password input is masked and is never printed.
# Windows DPAPI protects the saved value for the current Windows user/machine.
$pgClient = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path -LiteralPath $pgClient)) { throw 'PostgreSQL 18 command-line tools were not found.' }
$pgSecret = Read-Host 'Enter the PostgreSQL postgres password set during installation' -AsSecureString
$pgPointer = [IntPtr]::Zero
$pgPreviousPassword = $env:PGPASSWORD
try {
    $pgPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgSecret)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pgPointer)
    & $pgClient -X -w -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT version(), current_user, current_database();'
    if ($LASTEXITCODE -ne 0) { throw 'Connection failed. No credentials were saved.' }
    $pgConfigDirectory = Join-Path $env:USERPROFILE 'PermitManagementConfig'
    $pgConfigFile = Join-Path $pgConfigDirectory 'postgres-migration.json'
    if (Test-Path -LiteralPath $pgConfigFile) { throw 'Migration connection already exists; it was not overwritten.' }
    New-Item -ItemType Directory -Force -Path $pgConfigDirectory | Out-Null
    @{
        host = 'localhost'; port = 5432; user = 'postgres'; database = 'postgres'
        passwordDpapi = ConvertFrom-SecureString $pgSecret
    } | ConvertTo-Json | Set-Content -LiteralPath $pgConfigFile -Encoding UTF8
    Write-Host "Connection verified. Encrypted local credentials saved to $pgConfigFile"
    Write-Host 'No databases or application settings were changed.'
} finally {
    $env:PGPASSWORD = $pgPreviousPassword
    if ($pgPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pgPointer) }
    $pgSecret.Dispose()
}
