# Run only at the approved switch, with both old and preview web servers stopped.
# Persistent accounts/permits/tickets remain untouched; require everyone to sign in.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$apps=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration-apps.json') -Raw | ConvertFrom-Json
foreach($database in @('permit_system_migration','queue_system_migration')){
 $config=$apps.connections | Where-Object {$_.database -eq $database}
 if(!$config -or $config.host -ne 'localhost'){throw 'Unexpected connection'}
 $password=Unseal-Password $config.passwordDpapi
 try{
  $sql=if($database -eq 'permit_system_migration'){'BEGIN; DELETE FROM public.permit_presence; DELETE FROM public.permit_sessions; COMMIT;'}else{'DELETE FROM public.active_workstations;'}
  Invoke-Postgres $database $config.user $password $sql
  Write-Output "Cleared temporary sign-in state: $database"
 }finally{$password=$null}
}
