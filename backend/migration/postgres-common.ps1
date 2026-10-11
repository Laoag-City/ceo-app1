$pgClient = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
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
        if ($process.ExitCode -ne 0) {
            if ($script:PgMetadataDiagnostics) { Write-Output $errTask.GetAwaiter().GetResult() }
            throw 'PostgreSQL setup command failed. Output containing SQL or credentials was suppressed; inspect the setup before retrying.'
        }
        return $outTask.GetAwaiter().GetResult().Trim()
    } finally { $process.Dispose() }
}
