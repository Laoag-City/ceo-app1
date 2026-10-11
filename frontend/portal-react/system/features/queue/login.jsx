/** MAINTAINER GUIDE
 * queue-log-in layout source. Preserve IDs, names, and legacy handler attributes: the companion HTML controller relies on them.
 * Rebuild and publish the system bundle after editing this file.
 */
import React from 'react'
import WorkstationChooser from './WorkstationChooser'

function AuthIcon({ name }) {
 const paths = {
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z"/><path d="M15 7v2m0 2v2m0 2v2"/></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
  back: <path d="m10 5-7 7 7 7M3 12h18"/>
 }
 return <svg className="staff-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

// Layout is React-owned at mount; existing controllers own interactive regions.
export default function Page() {
 if(window.location.pathname!=='/workstations.html') return <>
  <header className="site-header">
   <div className="top-bar-brand">
    <img className="top-bar-logo" src="/assets/laoag-city-official-seal.png" alt="Laoag City official seal"/>
    <div><div className="top-bar-title">Queue Management Sign In</div><div className="top-bar-subtitle">Office of the City Engineer — Laoag City</div></div>
   </div>
   <div className="top-bar-actions"><a className="outline-action header-back" href="/portal.html" aria-label="Return to portal" title="Return to portal"><AuthIcon name="back"/><span>Portal</span></a></div>
  </header>
  <main className="shell">
   <div className="card" aria-label="Queue management sign in">
    <section className="hero">
     <div className="hero-content">
      <div className="eyebrow">Daily queue operations</div>
      <h1>Your queue. One sign in.</h1>
      <p>A single workspace for registering visitors, serving tickets, and keeping every client moving forward.</p>
      <div className="feature-list">
       <div className="chip"><span className="chip-icon"><AuthIcon name="people"/></span>Register visitors</div>
       <div className="chip"><span className="chip-icon"><AuthIcon name="ticket"/></span>Serve the next ticket</div>
       <div className="chip"><span className="chip-icon"><AuthIcon name="list"/></span>Follow the waiting line</div>
       <div className="chip"><span className="chip-icon"><AuthIcon name="monitor"/></span>Choose your workstation</div>
      </div>
     </div>
     <div className="helper">Use your authorized staff account to access registration, service windows, and client history.</div>
    </section>
    <section className="panel">
     <div className="panel-heading"><div className="kicker">Authorized personnel</div><h2>Welcome back</h2><p>Sign in with your staff account to choose your workstation.</p></div>
     <form id="queueSignInForm">
      <label htmlFor="queueUsername">Username</label>
      <input id="queueUsername" autoComplete="username" maxLength={50} placeholder="Enter your username" required/>
      <label htmlFor="queuePassword">Password</label>
      <input id="queuePassword" type="password" autoComplete="current-password" placeholder="Enter your password" required/>
      <button className="btn" id="queueSignInButton" type="submit">Sign in</button>
     </form>
     <p className="staff-login-back"><a href="/portal.html">Back to portal</a></p>
     <p id="sessionStatus" className="status error" role="status" aria-live="polite"/>
    </section>
   </div>
  </main>
 </>;

  return <WorkstationChooser />
}
