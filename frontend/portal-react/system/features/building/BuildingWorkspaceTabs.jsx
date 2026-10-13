import React, {useRef} from 'react'

// Toggle existing DOM panels without rerendering controller-owned forms/drafts.
export default function BuildingWorkspaceTabs() {
  const bar=useRef(null)
  function select(panel, focus=false) {
    const workspace=bar.current.closest('.building-workspace')
    for(const button of bar.current.querySelectorAll('[role="tab"]')) {
      const active=button.dataset.panel===panel
      button.classList.toggle('active',active)
      button.setAttribute('aria-selected',String(active))
      button.tabIndex=active?0:-1
      const target=workspace.querySelector('#'+button.getAttribute('aria-controls'))
      target.hidden=!active
      target.classList.toggle('active',active)
      if(active&&focus)button.focus()
    }
  }
  function keydown(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
    const tabs=[...bar.current.querySelectorAll('[role="tab"]')]
    const index=tabs.indexOf(event.target.closest('[role="tab"]'))
    if(index<0)return
    event.preventDefault()
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length
    select(tabs[next].dataset.panel,true)
  }
  return <div ref={bar} className="workspace-tabs" role="tablist" aria-label="Building permit sections" onKeyDown={keydown}>
    <button type="button" id="building-routing-tab" role="tab" className="ws-tab active" data-panel="routing" aria-controls="panel-routing" aria-selected="true" onClick={()=>select('routing')}>
      Routing Matrix <span className="tab-badge" id="tbRouting">0</span>
    </button>
    <button type="button" id="building-inspection-tab" role="tab" className="ws-tab" data-panel="inspection" aria-controls="panel-inspection" aria-selected="false" tabIndex={-1} onClick={()=>select('inspection')}>
      Inspections <span className="tab-badge" id="tbInspection">0</span>
    </button>
    <button type="button" id="building-requirements-tab" role="tab" className="ws-tab" data-panel="checklist" aria-controls="panel-checklist" aria-selected="false" tabIndex={-1} onClick={()=>select('checklist')}>
      Requirements <span className="tab-badge" id="tbChecklist">0/16</span>
    </button>
  </div>
}
