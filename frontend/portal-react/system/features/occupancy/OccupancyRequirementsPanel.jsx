import React from 'react'
import {ChecklistHeader,ChecklistProgress} from '../../shared/PermitChecklist'
import {legacyAttributes} from '../../shared/legacy-attributes'

export default function OccupancyRequirementsPanel(){
  return <section id="panel-checklist" className="tab-panel card panel-card permit-checklist">
    <ChecklistHeader/>
    <div className="card-body"><ChecklistProgress total={15}/>
      <p className="checklist-guidance">Mark the documents received. Conditional documents apply only when needed for this project.</p>
      <p id="checklistFeedback" className="checklist-feedback" role="status" aria-live="polite">Loading saved checklist…</p>
      <div id="checklistContainer"/>
      <div className="checklist-actions"><button type="button" id="reloadChecklist" ref={legacyAttributes({onclick:'loadChecklist()'})}>Refresh saved checklist</button><button type="button" className="checklist-save" id="saveClBtn" disabled ref={legacyAttributes({onclick:'saveChecklist()'})}>Save Checklist</button></div>
    </div>
  </section>
}
