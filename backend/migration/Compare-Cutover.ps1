$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$apps=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
$connections=@($apps.connections | ForEach-Object {
 @{host=$_.host;port=$_.port;database=$_.database;user=$_.user;password=(Unseal-Password $_.passwordDpapi)}
})
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=(Get-Command node.exe).Source
$start.Arguments='"'+"$PSScriptRoot\compare-cutover.cjs"+'"'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['OFFICE_COMPARE_CONNECTIONS']=($connections|ConvertTo-Json -Compress)
$process=New-Object System.Diagnostics.Process;$process.StartInfo=$start
try{
 [void]$process.Start();$start.EnvironmentVariables.Remove('OFFICE_COMPARE_CONNECTIONS')
 $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
 $process.WaitForExit();Write-Output $out.GetAwaiter().GetResult();Write-Output $err.GetAwaiter().GetResult()
 if($process.ExitCode -ne 0){throw 'Database comparison failed. No data was changed.'}
}finally{$process.Dispose();$connections=$null}
