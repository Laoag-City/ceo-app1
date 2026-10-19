import React from 'react'
import HelpMark from '../../shared/HelpMark'

function WorkstationIcon({name,className=''}) {
 if(name==='help')return <HelpMark/>
 const paths={
  clipboard:<><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V2h6v2M9 11h6M9 15h6"/></>,
  window:<><path d="M4 21V4h9v17M13 10h6v11M2 21h20M7 8h3M7 12h3M7 16h3"/></>,
  monitor:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
  history:<><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l3 2"/></>,
  reports:<><path d="M4 3v18h17M8 17v-5M13 17V8M18 17V5"/></>,
  video:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></>,
  arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
  open:<path d="M7 17 17 7M7 7h10v10"/>,
  check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>
 };
 return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function GroupHeading({id,title,description,walkthrough=false}) {
 return <div className="workstation-group-heading"><h3 id={id}>{title}</h3>{walkthrough?<div className="workstation-group-meta"><div className="workstation-guide-actions"><button type="button" className="workstation-walkthrough context-help-guide" aria-haspopup="dialog" onClick={event=>window.dispatchEvent(new CustomEvent('system-walkthrough',{detail:{opener:event.currentTarget}}))}><WorkstationIcon name="help"/>Walkthrough</button><span data-appearance-target="queue-walkthrough"/></div><span>{description}</span></div>:<span>{description}</span>}</div>
}

const windows=[
 {value:'PC1',title:'Window 1',description:'Building and occupancy permit receiving / inquiries',accent:'blue'},
 {value:'PC2',title:'Window 2',description:'Occupancy permit releasing',accent:'green'},
 {value:'PC3',title:'Window 3',description:'Building permit releasing',accent:'gold'}
];

export default function WorkstationChooser() {
 return <>
  <header className="app-header-bar site-header queue-site-header">
   <div className="brand"><img className="brand-mark" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal"/><div><h1>Office of the City Engineer</h1><p className="brand-subtitle">City Government of Laoag</p></div></div>
   <div className="header-context">Queue management</div><button type="button" id="queueSignOut" className="header-logout outline-action">Log out</button>
  </header>
  <main className="container login-container queue-workstation-chooser">
   <div className="login-heading"><div className="login-kicker">Queue operations</div><h2>Choose your workstation</h2><p className="welcome-text">Select a workstation to open queue operations.</p></div>
   <form id="loginForm">
    <section className="workstation-group" aria-labelledby="registrationHeading">
     <GroupHeading id="registrationHeading" title="Registration" description="Visitor intake" walkthrough/>
     <button type="button" className="station-card workstation-registration" data-value="Kiosk">
      <span className="workstation-registration-top"><span className="station-symbol"><WorkstationIcon name="clipboard"/></span><span className="workstation-ready"><WorkstationIcon name="check"/>Ready to open</span></span>
      <span className="station-label">Registration Desk</span><span className="station-sublabel">Register visitors and issue queue tickets.</span>
      <span className="workstation-open-desk">Open desk<WorkstationIcon name="arrow"/></span>
     </button>
    </section>
    <section className="workstation-group" aria-labelledby="serviceCountersHeading">
     <GroupHeading id="serviceCountersHeading" title="Service Counters" description="3 windows"/>
     <div className="workstation-counter-grid">
      {windows.map(station=><button key={station.value} type="button" className={'station-card workstation-counter workstation-accent-'+station.accent} data-value={station.value}>
       <span className="workstation-card-top"><span className="station-symbol"><WorkstationIcon name="window"/></span><WorkstationIcon name="open" className="station-open-arrow"/></span>
       <span className="station-label">{station.title}</span><span className="station-sublabel">{station.description}</span>
      </button>)}
     </div>
    </section>
    <section className="workstation-group" aria-labelledby="otherToolsHeading">
     <GroupHeading id="otherToolsHeading" title="Other Tools"/>
     <div className="workstation-tools-grid">
      <button type="button" className="station-card workstation-tool" data-value="Monitor"><span className="station-symbol"><WorkstationIcon name="monitor"/></span><span className="station-label">Monitor Display</span><span className="station-sublabel">Queue announcements and office videos</span></button>
      <a className="station-card client-history-link workstation-tool" href="client-history.html"><span className="station-symbol"><WorkstationIcon name="history"/></span><span className="station-label">Client History</span><span className="station-sublabel">Previous visits and client records</span></a>
      <a className="station-card workstation-tool" href="reports.html"><span className="station-symbol"><WorkstationIcon name="reports"/></span><span className="station-label">Queue Reports</span><span className="station-sublabel">Visit totals, window activity, and service times</span></a>
      <a className="station-card workstation-tool" href="secret-management.html"><span className="station-symbol"><WorkstationIcon name="video"/></span><span className="station-label">Video Playlist</span><span className="station-sublabel">Upload, preview, and arrange monitor videos</span></a>
     </div>
    </section>
    <input type="hidden" id="workspaceSelect" required/>
    <p id="sessionStatus" role="status" aria-live="polite"/>
   </form>
  </main>
 </>
}
