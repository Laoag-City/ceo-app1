import React from 'react'
import {legacyAttributes} from './legacy-attributes'

// Both permit workspaces use the same controls and guarded controller.
export function InspectionPanel({kind, tab=false, labelledBy}) {
  return <section id="panel-inspection" data-inspections-kind={kind} className={`permit-inspections card${tab ? ' tab-panel panel-card' : ''}`} role={labelledBy ? 'tabpanel' : undefined} aria-labelledby={labelledBy} hidden={Boolean(labelledBy)}>
    <div className="card-header inspection-panel-header">
      <div className="card-heading-group">
        <span className="card-heading-icon"><svg className="mdi-icon" aria-hidden="true"><use href="/assets/mdi-interface-icons.svg#mdi-magnify"/></svg></span>
        <div><h2>Inspection Monitoring</h2><p>Site visits, findings, and results</p></div>
      </div>
      <div className="inspection-panel-actions">
        <button type="button" className="insp-action" ref={legacyAttributes({onclick:'loadInspections()'})}>Refresh</button>
        <button type="button" className="btn-add-insp" ref={legacyAttributes({onclick:'openInspModal()'})}>＋ Log inspection</button>
      </div>
    </div>
    <div className="card-body">
      <p id="inspectionFeedback" role="status" aria-live="polite">Loading inspections…</p>
      <div className="insp-toolbar"><div className="summary-badges" id="inspSummaryBadges"/></div>
      <div id="inspectionList"/>
    </div>
  </section>
}

export function InspectionModal() {
  return <div id="inspModal" className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="inspModalTitle">
    <div className="modal-window">
      <div className="modal-header">
        <h3 id="inspModalTitle">Log Inspection</h3>
        <button type="button" className="modal-close" aria-label="Close inspection" ref={legacyAttributes({onclick:'closeInspModal()'})}>×</button>
      </div>
      <div className="modal-body">
        <input type="hidden" id="editInspId"/>
        <div className="form-row-2">
          <div className="form-group"><label htmlFor="inspType">Inspection Type</label><select id="inspType">{['Preliminary','Final','Follow-up','Special'].map(type=><option key={type}>{type}</option>)}</select></div>
          <div className="form-group"><label htmlFor="inspDate">Inspection Date</label><input type="date" id="inspDate" required/></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label htmlFor="inspInspector">Inspector Name</label><input type="text" id="inspInspector" required maxLength={150} placeholder="Full name"/></div>
          <div className="form-group"><label htmlFor="inspResult">Result</label><select id="inspResult"><option>Scheduled</option><option>Passed</option><option>Failed</option><option value="Conditional">Conditional Pass</option></select></div>
        </div>
        <div className="form-group"><label htmlFor="inspFindings">Findings / Remarks</label><textarea id="inspFindings" required placeholder="Describe inspection findings, deficiencies, or notes…" defaultValue=""/></div>
        <div className="form-group"><label htmlFor="inspNextDate">Next Inspection Date (optional)</label><input type="date" id="inspNextDate"/></div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-mc" ref={legacyAttributes({onclick:'closeInspModal()'})}>Cancel</button>
        <button type="button" className="btn-ms" id="inspSaveBtn" ref={legacyAttributes({onclick:'saveInspection()'})}>Save Inspection</button>
      </div>
    </div>
  </div>
}
