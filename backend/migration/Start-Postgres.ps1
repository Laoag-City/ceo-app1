param([ValidateSet('permit','queue')][string]$Service='permit')
# Normal-port PostgreSQL launcher. Windows credentials are decrypted locally;
# no fallback to MySQL, no changes to machine-wide environment variables.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
. "$PSScriptRoot\foreground-node.ps1"
$apps=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
$connections=@($apps.connections | ForEach-Object {
 $source=if($_.database -eq 'permit_system_migration'){'permit_system'}elseif($_.database -eq 'queue_system_migration'){'queue_system'}else{throw 'Unexpected database'}
 @{source=$source;host=$_.host;port=$_.port;database=$_.database;user=$_.user;password=(Unseal-Password $_.passwordDpapi)}
})
$file=if($Service -eq 'permit'){Join-Path $PSScriptRoot '..\monitorBP backend\monitorServer.js'}else{Join-Path $PSScriptRoot '..\queue backend\queueServer.js'}
$serverEnvironment=@{
 DB_ENGINE='postgres';TZ='Asia/Manila';OFFICE_PG_CONNECTIONS=($connections|ConvertTo-Json -Compress)
 PERMIT_PORT='3000';QUEUE_PORT='5000';PERMIT_COOKIE_NAME='permit_session';QUEUE_COOKIE_NAME='queue_session'
 OFFICE_BIND_HOST='127.0.0.1';OFFICE_PG_PREVIEW='0'
 PERMIT_PUBLIC_ORIGIN=$null;QUEUE_PUBLIC_ORIGIN=$null
}
try{
 $port=if($Service -eq 'permit'){3000}else{5000}
 Write-Output "Starting PostgreSQL $Service server on port $port. Press Ctrl+C in this terminal to stop it."
 Invoke-OfficeNode -NodeExecutable (Get-Command node.exe).Source -ServerFile $file -ServerEnvironment $serverEnvironment
}finally{$serverEnvironment['OFFICE_PG_CONNECTIONS']=$null;$connections=$null}
