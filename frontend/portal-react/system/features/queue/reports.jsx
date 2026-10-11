import React from 'react'
import css from './reports.css?inline'

const services = [['Releasing Bldg. Permit','Building permit releasing'],['Releasing Bldg. Occupancy','Occupancy permit releasing'],['Receiving Bldg. Permit','Building application receiving'],['Receiving Bldg. Occupancy','Occupancy application receiving'],['Inquire','Inquiries']]
const metrics = [['registered','Registered'],['completed','Finished'],['dropped','Dropped'],['waiting','Waiting'],['holding','On hold'],['serving','In service']]

// Mount once: the report controller updates results without rerendering legacy pages.
export default function QueueReports() {
 return <>
  <style>{css}</style>
  <header className="app-header-bar site-header queue-site-header">
   <div className="brand"><img className="brand-mark" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal"/><div><h1>Office of the City Engineer</h1><p className="brand-subtitle">City Government of Laoag</p></div></div>
   <a className="header-logout outline-action" href="workstations.html">← Back to station</a>
  </header>
  <main className="management-container reports-container">
   <section className="reports-heading reports-panel">
    <div><p className="reports-kicker">Queue records</p><h2>Queue reports</h2><p>A clear view of visits, outcomes, and time spent at each window.</p></div>
    <div className="reports-actions"><button id="reportRefresh" type="button" className="report-button">Refresh</button><button id="reportExport" type="button" className="report-button" disabled>Download CSV</button><button id="reportPrint" type="button" className="report-button" disabled>Print</button></div>
   </section>
   <section className="reports-panel reports-filters" aria-label="Report filters">
    <form id="reportFilters">
     <label>From<input id="reportFrom" name="from" type="date" required/></label>
     <label>To<input id="reportTo" name="to" type="date" required/></label>
     <label>Window<select id="reportWindow" name="window"><option value="">All windows</option><option value="PC1">Window 1</option><option value="PC2">Window 2</option><option value="PC3">Window 3</option></select></label>
     <label>Service<select id="reportService" name="service"><option value="">All services</option>{services.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <button id="reportApply" className="report-button report-primary" type="submit">Apply filters</button>
    </form>
    <p>Includes visits registered within these dates in Philippine time, including archived visits. Statuses reflect the latest saved outcome of those visits.</p>
   </section>
   <div id="reportFeedback" className="report-feedback" role="status" aria-live="polite" hidden/>
   <div id="reportResults" aria-busy="true">
    <p id="reportPeriod" className="report-period" aria-live="polite">Loading report…</p>
    <section className="reports-metrics" aria-label="Visit totals">{metrics.map(([key,label])=><article className="reports-panel report-metric" key={key}><p>{label}</p><strong id={'report-'+key}>—</strong></article>)}</section>
    <section className="reports-timing reports-panel" aria-label="Measured visit times">
     <div><p>Average wait to first call</p><strong id="reportWait">—</strong><small>Registration to first call</small></div>
     <div><p>Average service time</p><strong id="reportDuration">—</strong><small>Finished visits only · held time excluded</small></div>
     <p id="reportCoverage">Earlier visits without recorded timestamps are excluded from time averages.</p>
    </section>
    <section className="reports-panel reports-daily" aria-labelledby="dailyReportTitle">
     <div className="report-section-heading"><h3 id="dailyReportTitle">Daily visits</h3><span><i/>Registered <i className="finished-key"/>Finished</span></div>
     <div id="reportChart" className="report-chart" role="img" aria-label="Daily registered and finished visits"/>
     <details className="report-daily-details"><summary>View daily totals</summary><div className="report-table-wrap" tabIndex={0} aria-label="Daily totals table"><table><thead><tr><th scope="col">Date</th><th scope="col">Registered</th><th scope="col">Finished</th><th scope="col">Dropped</th></tr></thead><tbody id="reportDailyRows"/></table></div></details>
    </section>
    <section className="reports-panel" aria-labelledby="windowReportTitle">
     <div className="report-section-heading"><h3 id="windowReportTitle">By service window</h3></div>
     <div className="report-table-wrap" tabIndex={0} aria-label="Window totals table"><table><thead><tr><th scope="col">Window</th>{metrics.map(([key,label])=><th scope="col" key={key}>{label}</th>)}<th scope="col">Avg. wait</th><th scope="col">Avg. service</th></tr></thead><tbody id="reportWindowRows"/></table></div>
    </section>
    <p id="reportUpdated" className="report-footnote"/>
   </div>
  </main>
 </>
}
