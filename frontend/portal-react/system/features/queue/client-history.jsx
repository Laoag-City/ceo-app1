import React from 'react'

function Icon({name}) {
 const paths = {
  back: <path d="m10 5-7 7 7 7M3 12h18"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/></>
 }
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

// Mounted once; the companion controller owns the search results and pagination.
export default function ClientHistory() {
 return <>
  <header className="app-header-bar site-header queue-site-header">
   <div className="brand">
    <img className="brand-mark" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal"/>
    <div><h1>Office of the City Engineer</h1><p className="brand-subtitle">City Government of Laoag</p></div>
   </div>
   <a className="header-logout outline-action" href="workstations.html"><Icon name="back"/>Back to station</a>
  </header>
  <main className="management-container client-history-container">
   <section className="history-heading" aria-labelledby="historyTitle">
    <div><p className="history-kicker">Queue records</p><h2 id="historyTitle">Client history</h2><p>Find registered clients and their previous visits.</p></div>
    <button id="historyRefresh" className="history-button" type="button"><Icon name="refresh"/>Refresh</button>
   </section>
   <section className="history-panel" aria-label="Search client records">
    <form id="historySearchForm" className="history-search-form" role="search">
     <label htmlFor="historySearch">Search by name, address, ticket ID, or phone number</label>
     <div className="history-search-controls">
      <div className="history-search-input"><Icon name="search"/><input id="historySearch" name="q" type="search" maxLength={200} placeholder="e.g. Juan Dela Cruz, Laoag, TKT-1001, or 09…" autoComplete="off"/></div>
      <button className="history-button history-primary" type="submit">Search</button>
      <button id="historyClear" className="history-button" type="button" hidden>Clear</button>
     </div>
    </form>
    <div className="history-results-heading"><h3>Registered visits</h3><p id="historyCount" aria-live="polite">Loading records…</p></div>
    <div id="historyFeedback" className="history-feedback" role="status" aria-live="polite" hidden/>
    <div id="historyResults" className="history-table-wrap" aria-busy="true" tabIndex={0} aria-label="Client records table">
     <table className="history-table">
      <thead><tr><th scope="col">Ticket ID</th><th scope="col">Client / representative</th><th scope="col">Phone number</th><th scope="col">Address</th><th scope="col">Service</th><th scope="col">Status</th><th scope="col">Registered</th></tr></thead>
      <tbody id="historyTableBody"><tr><td colSpan={7} className="history-empty">Loading client records…</td></tr></tbody>
     </table>
    </div>
    <footer className="history-footer">
     <p id="historyRange">Ticket numbers may repeat on different days. Check the registered date.</p>
     <nav className="history-pagination" aria-label="Client history pages">
      <button id="historyPrevious" className="history-button" type="button" disabled>Previous</button>
      <span id="historyPage" aria-live="polite">Page 1</span>
      <button id="historyNext" className="history-button" type="button" disabled>Next</button>
     </nav>
    </footer>
   </section>
  </main>
 </>
}
