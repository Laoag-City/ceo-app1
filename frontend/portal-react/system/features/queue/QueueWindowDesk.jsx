import React from 'react'

function Icon({name}) {
  const paths={next:<><path d="M5 12h14M13 6l6 6-6 6"/></>,hold:<><path d="M8 5v14M16 5v14"/></>,drop:<><path d="m6 6 12 12M18 6 6 18"/></>,recall:<><path d="m4 10 8-4v12l-8-4v-4ZM12 9l4-2v10l-4-2M19 8a7 7 0 0 1 0 8"/></>,ticket:<><path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5"/></>,back:<><path d="M19 12H5m6-6-6 6 6 6"/></>,check:<><path d="m5 12 4 4L19 6"/></>};
  return <svg className="desk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function QueueWindowControls() {
  return <div className="admin-section window-desk" id="clerkSection">
    <div className="desk-window-heading"><span className="desk-eyebrow">Your service window</span><h3 id="clerkHeader">Window</h3><p id="windowServiceDescription"/></div>
    <section className="current-ticket-panel" aria-labelledby="currentTicketHeading">
      <div className="desk-current-heading"><span id="currentTicketHeading">Now serving</span><span className="desk-current-status" id="activeTicketStatus">Connecting</span></div>
      <Icon name="ticket"/><strong id="activeTicketLabel">Connecting…</strong>
      <p id="activeTicketName" className="desk-client-name"/>
      <p id="activeTicketReason" className="desk-client-service"/>
      <div className="desk-current-tools"><button type="button" id="recallBtn"><Icon name="recall"/>Call again</button><button type="button" id="activeDetailsBtn">Client details</button></div>
    </section>
    <div className="clerk-actions-grid">
      <button type="button" className="desk-next" id="callNextBtn"><Icon name="next"/><span>Next ticket</span></button>
      <button type="button" className="desk-hold" id="holdBtn"><Icon name="hold"/><span>Hold ticket</span></button>
      <button type="button" className="desk-drop" id="dropBtn"><Icon name="drop"/><span>Drop ticket</span></button>
    </div>
    <p className="desk-action-hint">Next ticket finishes the current client and calls the next waiting client.</p>
    <p id="queueActionFeedback" role="status" aria-live="polite"/>
    <button type="button" id="logoutBtn" className="desk-back"><Icon name="back"/>Back to workstations</button>
    <details className="queue-maintenance"><summary className="queue-maintenance-label">Queue maintenance</summary><button type="button" className="btn-reset" id="resetBtn">Reset entire queue</button></details>
  </div>
}

export function QueueTicketLists() {
  return <div className="container line-queues-card desk-queues">
    <div className="desk-list-heading"><div><span className="desk-eyebrow">This window</span><h3>Tickets</h3></div><span className="desk-live"><span/>Live queue</span></div>
    <div className="desk-tabs" role="tablist" aria-label="Ticket lists">
      <button type="button" id="waitingTab" role="tab" aria-controls="waitingPanel" aria-selected="true" data-list="waiting">Waiting<span id="waitingCount">0</span></button>
      <button type="button" id="heldTab" role="tab" aria-controls="heldPanel" aria-selected="false" tabIndex={-1} data-list="held">On hold<span id="heldCount">0</span></button>
      <button type="button" id="finishedTab" role="tab" aria-controls="finishedPanel" aria-selected="false" tabIndex={-1} data-list="finished">Finished<span id="finishedCount">0</span></button>
    </div>
    <section id="waitingPanel" role="tabpanel" aria-labelledby="waitingTab"><p className="desk-list-note">Next ticket calls the first client in this list.</p><div id="clerkQueueList" className="scrollable-queue-box"/></section>
    <section id="heldPanel" role="tabpanel" aria-labelledby="heldTab" hidden><p className="desk-list-note">Click a held ticket to resume it at this window. Your current client will move to Finished.</p><div id="clerkHoldList" className="scrollable-queue-box"/></section>
    <section id="finishedPanel" role="tabpanel" aria-labelledby="finishedTab" hidden><p className="desk-list-note">Completed clients at this window. Dropped tickets remain in Client history.</p><div id="clerkFinishedList" className="scrollable-queue-box"/></section>
  </div>
}
