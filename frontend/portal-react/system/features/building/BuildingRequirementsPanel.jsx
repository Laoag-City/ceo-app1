import React from 'react'
import {ChecklistHeader,ChecklistProgress} from '../../shared/PermitChecklist'

// Mount once; the companion controller owns checkboxes and saved progress.
export default function BuildingRequirementsPanel(){
  return <section id="panel-checklist" className="card panel-card building-requirements permit-checklist" role="tabpanel" aria-labelledby="building-requirements-tab" hidden>
    <ChecklistHeader/>
    <div className="card-body">
      <ChecklistProgress total={16}/>
      <p className="checklist-guidance">Mark documents received and procedure steps completed. Required documents are subject to the conditions shown below.</p>
      <p id="buildingChecklistFeedback" className="checklist-feedback" role="status" aria-live="polite">Loading saved checklist…</p>
      <div id="checklistContainer"/>
      <div className="checklist-actions"><button id="reloadBuildingChecklist" type="button">Refresh saved checklist</button><button id="saveClBtn" type="button" className="checklist-save" disabled>Save Checklist</button></div>
    </div>
  </section>
}
