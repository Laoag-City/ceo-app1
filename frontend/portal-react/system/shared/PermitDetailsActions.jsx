import React from 'react'

export default function PermitDetailsActions({kind}) {
 const id=new URLSearchParams(window.location.search).get('id') || ''
 return <nav className="action-bar permit-details-actions" aria-label="Permit actions"><div className="action-bar-left">
  <a className="btn-back" href={kind==='occupancy'?'/occupancy':'/'}><svg className="mdi-icon" aria-hidden="true" focusable="false"><use href="/assets/mdi-interface-icons.svg#mdi-arrow-left"/></svg>Back to Registry</a>
  <a className="btn-back" target="_blank" rel="noopener" href={'/project-summary.html?kind='+kind+'&id='+encodeURIComponent(id)}>Print Summary</a>
 </div></nav>
}
