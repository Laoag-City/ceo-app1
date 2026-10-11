# Keep Node attached to this terminal: logs stream immediately and Ctrl+C reaches it.
function Invoke-OfficeNode {
    param(
        [Parameter(Mandatory=$true)][string]$NodeExecutable,
        [Parameter(Mandatory=$true)][string]$ServerFile,
        [Parameter(Mandatory=$true)][hashtable]$ServerEnvironment
    )
    $priorEnvironment=@{}
    try {
        foreach ($name in $ServerEnvironment.Keys) {
            $priorEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
            [Environment]::SetEnvironmentVariable($name,$ServerEnvironment[$name],'Process')
        }
        & $NodeExecutable $ServerFile
        $nodeExitCode=$LASTEXITCODE
        if ($nodeExitCode -ne 0) {throw "Office server exited with code $nodeExitCode. See the server output above."}
    } finally {
        foreach ($name in $priorEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name,$priorEnvironment[$name],'Process')
        }
    }
}
