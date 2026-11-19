import React from 'react'

export default function ServiceSummary() {
  return <>
    <header className="app-header-bar site-header queue-site-header">
      <div className="brand">
        <img className="brand-mark" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal"/>
        <div><h1>Office of the City Engineer</h1><p className="brand-subtitle">City Government of Laoag</p></div>
      </div>
      <a className="header-logout outline-action" href="workstations.html">Back to station</a>
    </header>
    <main className="management-container client-history-container">
      <section className="history-heading" aria-labelledby="historyTitle">
        <div><h2 id="historyTitle">Service Summary</h2><p>Tickets issued for each requested service.</p></div>
        <button id="historyRefresh" className="history-button" type="button">Refresh</button>
      </section>
      <section className="history-panel" aria-label="Service totals">
        <form id="historySearchForm" className="history-search-form">
          <div className="history-search-controls">
            <label>From<input id="historyFrom" type="date" required/></label>
            <label>To<input id="historyTo" type="date" required/></label>
            <button className="history-button history-primary" type="submit">Apply dates</button>
          </div>
        </form>
        <p id="historyFeedback" className="history-feedback" role="status" hidden/>
        <div id="historyResults" className="history-table-wrap" aria-busy="true">
          <table className="history-table">
            <thead><tr><th scope="col">Requested service</th><th scope="col">Tickets issued</th></tr></thead>
            <tbody id="historyTableBody"/>
            <tfoot><tr><th scope="row">Total</th><td id="historyCount" aria-live="polite">Loading…</td></tr></tfoot>
          </table>
        </div>
      </section>
    </main>
  </>
}
