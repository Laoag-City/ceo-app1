param([ValidateSet('backup','verify','restore-new','list')][string]$Action='backup',[string]$BackupId='')
# Credentials stay in this process/child environment. This wrapper also restricts
# the private backup directory to this Windows account, SYSTEM and Administrators.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$backupRoot=Join-Path $env:USERPROFILE 'PermitManagementPostgresBackups'
if(!(Test-Path -LiteralPath $backupRoot)){[void](New-Item -ItemType Directory -Path $backupRoot)}
if((Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup directory must not be a junction/link.'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $backupRoot /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not restrict backup directory permissions.'}
$config=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
if($config.host -ne 'localhost' -or $config.port -ne 5432 -or $config.user -ne 'postgres'){throw 'Unexpected PostgreSQL configuration.'}
if($BackupId -and $BackupId -notmatch '^pg-office-\d{14}-[a-f0-9]{12}$'){throw 'Invalid backup ID.'}
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=(Get-Command node.exe).Source
$start.Arguments='"'+"$PSScriptRoot\postgres-backup.cjs"+'" '+$Action+' '+$BackupId
$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['OFFICE_BACKUP_ROOT']=$backupRoot
$start.EnvironmentVariables['OFFICE_BACKUP_PASSWORD']=Unseal-Password $config.passwordDpapi
$process=New-Object System.Diagnostics.Process;$process.StartInfo=$start
try{
 [void]$process.Start();$start.EnvironmentVariables.Remove('OFFICE_BACKUP_PASSWORD')
 $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
 $process.WaitForExit();Write-Output $out.GetAwaiter().GetResult();Write-Output $err.GetAwaiter().GetResult()
 if($process.ExitCode -ne 0){throw 'PostgreSQL backup/recovery failed. Check latest-operation.json in the private backup folder.'}
}finally{if(!$process.HasExited){$process.Kill()};$process.Dispose()}
