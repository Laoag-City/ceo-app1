import React from 'react'

// Stable IDs keep the existing page controllers and saved state intact.
export function ChecklistHeader(){
  return <div className="card-header checklist-panel-header"><div className="card-heading-group">
    <span className="card-heading-icon checklist-heading-icon gold"><svg className="mdi-icon" aria-hidden="true"><use href="/assets/mdi-interface-icons.svg#mdi-file-document-plus-outline"/></svg></span>
    <div><h2>Documentary Requirements</h2><p>Submission and completion checklist</p></div>
  </div></div>
}
export function ChecklistProgress({total}){
  return <div className="permit-checklist-progress" role="progressbar" aria-label="Overall checklist completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
    <div className="checklist-ring"><svg viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="21" fill="none" stroke="var(--checklist-track)" strokeWidth="4"/>
      <circle id="ringFill" cx="26" cy="26" r="21" fill="none" stroke="var(--checklist-accent)" strokeWidth="4" strokeDasharray="131.95" strokeDashoffset="131.95" strokeLinecap="round"/>
    </svg><strong id="ringPct">0%</strong></div>
    <div className="checklist-progress-copy"><span className="checklist-eyebrow">Overall completion</span><strong id="clProgressLabel">0 of {total} items completed</strong><div className="checklist-progress-track"><div id="clProgressBar" style={{width:'0%'}}/></div></div>
  </div>
}
export function ChecklistSummary({total,subtitle='Document completion'}){
  return <section className="card permit-checklist-summary" id="checklistSideCard" style={{display:'none'}} aria-label="Checklist summary">
    <div className="card-header"><div className="card-heading-group"><span className="card-heading-icon checklist-summary-icon green"><svg className="mdi-icon" aria-hidden="true"><use href="/assets/mdi-interface-icons.svg#mdi-check-circle-outline"/></svg></span><div><h2>Checklist Summary</h2><p>{subtitle}</p></div></div></div>
    <div className="card-body"><div className="checklist-summary-metrics"><div><span className="checklist-eyebrow">Completion</span><strong id="sideClPct">0%</strong></div><span id="sideClEmoji" className="checklist-summary-art" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="6" y="5" width="20" height="24" rx="4" stroke="currentColor" strokeWidth="2"/><rect x="11" y="3" width="10" height="5" rx="2" fill="currentColor"/><path d="m10 16 2 2 4-4m3 3h3m-12 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span></div><div className="checklist-mini-progress" role="progressbar" aria-label="Checklist summary completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div id="sideClBar" style={{width:'0%'}}/></div><p id="sideClCount">0 of {total} items</p><p id="sideClStatus" className="checklist-summary-status">Not started</p></div>
  </section>
}
