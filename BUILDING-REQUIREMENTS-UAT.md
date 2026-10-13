# Building requirements checklist

Open a Building permit and select **Requirements**, beside Routing Matrix and Inspections.

The office sheet's nine numbered groups contain ten independently tracked documents. Structural Design Analysis and the Geotechnical Investigation Report are separate checkboxes, labelled 8a and 8b, with “If applicable” badges and their storey conditions. The six procedure steps are saved checkboxes, making 16 total items. Two conditional procedure steps also show “If applicable.” The Building and Occupancy panels share the same completion display and sidebar summary. Unchecked or conditional items do not change final-approval rules.

## Verify locally

1. Check Land Title, Plans and the first procedure step, then **Save Checklist**. Refresh the page: all three remain checked and the tab shows **3/16**. The main progress and sidebar summary should both show **19%**. Uncheck one, save and reload again.
2. Verify the fence note (3 sets), Structural Design Analysis (2 storeys or more), Geotechnical Investigation Report (3 storeys and above), and all six procedure steps against the office sheet.
3. Tick another document without saving. Switch to Routing Matrix and Inspections, then return. The draft must remain. Refresh saved checklist should ask before discarding it; cancel should retain the draft.
4. Open the same permit in two sessions using different operator accounts. Save different checklist changes in each. The second stale save must be blocked and its draft kept. Copy the draft before refreshing.
5. Open a different Building permit and an Occupancy permit. Their checklist states must remain independent.
6. Print Summary should contain the saved Building requirements, conditions and procedure completion. Unsaved checkboxes must not appear as submitted or completed. Occupancy summaries should retain their existing checklist.
7. Check Project Activity after saving: changed documents should have readable Building requirement names.
8. On a narrow screen, verify all three tabs, checkbox labels, badges and save/refresh buttons are usable. Check both permit types with keyboard Tab and Space: focus must stay on the checkbox as progress changes. Recheck routing edits and inspection creation.

## Database and deployment

The separate `permit_checklists` table has a unique `permit_id`, a foreign key to `permits.id` with cascade deletion, JSON state, and an update timestamp. Reads and writes use `/api/permits/:id/checklist`; only operators can write through the workspace. A version and parent-row lock prevent concurrent stale overwrites. Existing Occupancy storage is unchanged.

For a fresh or existing PostgreSQL environment, apply `backend/migration/permit-checklists.sql` as the schema owner, then grant the runtime role CRUD on `permit_checklists` and usage/select on `permit_checklists_id_seq` before starting the updated server. Fresh generated schema includes it. Locally, use `backend/migration/Apply-BuildingRequirements.ps1`.

The pilot deployment includes this release as of 13 October 2026. The additive checklist migration retained existing records. Use the hosted Permit website for signed-in acceptance tests.
