# Daily local application maintenance. No Codex session is required to run it.
# Interactive logon preserves access to this user's DPAPI credentials; the task
# runs only while this Windows account is signed in. Missed runs start when available.
$ErrorActionPreference='Stop'
$taskName='Office PostgreSQL Verified Backup'
$script=Join-Path $PSScriptRoot 'Postgres-Backup.ps1'
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script+'" -Action backup'
$action=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot
$zone=[TimeZoneInfo]::FindSystemTimeZoneById('Singapore Standard Time') # UTC+8, same clock as Manila.
if([TimeZoneInfo]::Local.BaseUtcOffset -ne $zone.BaseUtcOffset){throw 'Check machine timezone before scheduling 02:00 Manila time.'}
$trigger=New-ScheduledTaskTrigger -Daily -At '02:00'
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing -and ($existing.Actions.Execute -ne $powershell -or $existing.Actions.Arguments -ne $arguments)){throw 'Existing task differs; inspect it before replacement.'}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Back up both PostgreSQL migration databases and referenced queue media, restore to isolated temporary databases, verify checksums and identity positions, then remove temporary restores. Results: USERPROFILE\PermitManagementPostgresBackups\latest-operation.json.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
