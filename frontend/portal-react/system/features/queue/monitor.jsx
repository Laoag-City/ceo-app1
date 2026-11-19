/** MAINTAINER GUIDE
 * Public monitor layout. Preserve the IDs used by the queue controller.
 * React mounts once; the companion HTML controller owns live queue updates.
 */
import React from 'react'

export default function Page() {
  return <>
    <div className="header">
      <div className="header-content site-header queue-site-header">
        <div className="monitor-brand">
          <img className="monitor-seal" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal" />
          <div className="header-text"><h1>Office of the City Engineer</h1><p className="header-subtitle">Building and Occupancy Permit Queue</p></div>
        </div>
        <div className="header-context">
          <div className="monitor-live" id="monitorConnection"><span /><b>Connecting</b></div>
          <div className="logout-wrapper">
            <div className="logout-confirm-text" id="logoutTooltip">Back to station</div>
            <button type="button" className="btn-monitor-logout" id="logoutBtn" aria-label="Back to station" title="Back to station">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div className="display-container" id="mainDisplayContainer">
      <section className="now-serving monitor-calls is-idle" id="servingCard" aria-labelledby="nowCallingHeading">
        <div className="monitor-calls-heading">
          <h2 id="nowCallingHeading">Now calling</h2>
          <p className="monitor-guidance">Have your documents ready when your number is called.</p>
        </div>
        <div id="callingWindowList" className="monitor-calling-windows" role="list" aria-label="Current tickets by window" aria-live="polite" />
      </section>
      <section className="monitor-waiting-board" aria-labelledby="waitingQueueHeading">
        <div className="monitor-waiting-heading">
          <div><h2 id="waitingQueueHeading">Waiting tickets</h2><p id="waitingPaginationNote">Find your ticket number under your service window.</p></div>
          <span className="monitor-waiting-total" id="waitingQueueCount">0 waiting</span>
        </div>
        <div id="waitingQueueList" className="monitor-waiting-columns" aria-live="polite" aria-atomic="true" />
        <div id="monitorHoldList" className="monitor-hold-strip" hidden />
      </section>
    </div>
  </>
}
