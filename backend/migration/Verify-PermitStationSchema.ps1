# Read-only runtime-role validation of the installed station workflow tables.
$ErrorActionPreference='Stop'
. "$PSScriptRoot\postgres-common.ps1"
$stationSchemaConfig=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'PermitManagementConfig\postgres-migration.json') -Raw | ConvertFrom-Json
$stationSchemaPassword=Unseal-Password $stationSchemaConfig.passwordDpapi
try {
 $stationSchemaSql=@'
BEGIN READ ONLY;
SET LOCAL ROLE permit_app_migration;
SELECT json_build_object(
 'existing_building_projects',(SELECT count(*) FROM permits),
 'existing_occupancy_projects',(SELECT count(*) FROM occupancy_permits),
 'existing_edit_history',(SELECT count(*) FROM permit_change_requests)+(SELECT count(*) FROM occupancy_change_requests),
 'station_assignments',(SELECT count(*) FROM permit_station_assignments),
 'assignments_primary_key',(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='permit_station_assignments'::regclass AND contype='p'),
 'reviewer_tracking',(SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('permit_routing_matrix','occupancy_routing_matrix') AND column_name='last_updated_by'),
 'final_reviews',(SELECT count(*) FROM permit_final_reviews),
 'assignment_write',has_table_privilege(current_user,'permit_station_assignments','INSERT,UPDATE,DELETE'),
 'review_append',has_table_privilege(current_user,'permit_final_reviews','INSERT'),
 'review_read',has_table_privilege(current_user,'permit_final_reviews','SELECT'),
 'engineer_profiles_read',has_table_privilege(current_user,'permit_user_profiles','SELECT'),
 'resolved_station_operators',(SELECT count(COALESCE(NULLIF(TRIM(p.display_name),''),u.username)) FROM permit_station_assignments a INNER JOIN users u ON u.id=a.user_id LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.role='operator')
);
COMMIT;
'@
 Invoke-Postgres 'permit_system_migration' 'postgres' $stationSchemaPassword $stationSchemaSql
} finally {$stationSchemaPassword=$null;$stationSchemaConfig=$null}
