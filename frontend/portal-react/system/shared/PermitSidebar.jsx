import React, { useEffect, useRef, useState } from 'react'
import HelpMark from './HelpMark'

// This component owns only navigation state. Never rerender the legacy Page
// to toggle navigation: its controllers own form/table mutations after mount.
function Icon({ name }) {
  if(name==='help')return <HelpMark/>
  const paths = {
    building: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>,
    reports: <><path d="M4 3v18h17M8 16v-5m5 5V6m5 10v-7"/></>,
    inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/></>,
    requests: <><path d="M8 3H4v14h4M8 7h12v14H8Z"/><path d="M12 11h4m-4 4h4"/></>,
    registry: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 7h6l2 3h10l-3 11H3V7Z"/>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/></>,
    profile: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5 18a8 8 0 0 1 14 0"/></>,
    logout: <><path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13"/></>,
    collapse: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-12-4 4 4 4"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function PermitSidebar({ page }) {
  const occupancy = page.includes('occupancy')
  const dashboard = page === 'permits-superadmin'
  const monthly = page === 'permits-monthly-reports'
  const inbox = page === 'permits-approval-inbox'
  let role='';try {role=JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.role || ''}catch {}
  const admin = role === 'admin', superadmin = role === 'superadmin'
  const title = {
    'permits-monthly-reports':'Monthly Permit Reports',
    'permits-approval-inbox':'Approval Inbox',
    'permits-index': 'Building Permit Registry',
    'permits-edit': 'Building Permit Routing Workspace',
    'permits-occupancy': 'Occupancy Permit Registry',
    'permits-occupancy_edit': 'Occupancy Permit Workspace',
    'permits-superadmin': superadmin ? 'User Account Management' : 'Administrator Console'
  }[page] || 'Permit services'
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('permitNavCollapsed') === 'true' } catch { return false } })
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 1000px)').matches)
  const [open, setOpen] = useState(false)
  const [hash, setHash] = useState(() => window.location.hash)
  const [sectionsOpen, setSectionsOpen] = useState(() => ({
    reviews:inbox || ['#finalReviews','#buildingReview','#occupancyReview'].includes(window.location.hash),
    registries:!dashboard && !monthly && !inbox,
    reports:monthly
  }))
  const [signingOut, setSigningOut] = useState(false)
  const panel = useRef(null), trigger = useRef(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    document.body.classList.add('permit-navigation')
    const header = document.querySelector('.site-header')
    // Header size changes only on layout/resize; scrolling never repositions navigation.
    const measure = () => document.body.style.setProperty('--permit-header-bottom', `${header?.offsetHeight || 0}px`)
    measure()
    const observer = new ResizeObserver(measure)
    if (header) observer.observe(header)
    window.addEventListener('resize', measure)
    const media = matchMedia('(max-width: 1000px)')
    const changed = () => { setMobile(media.matches); setOpen(false) }
    media.addEventListener('change', changed)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); media.removeEventListener('change', changed) }
  }, [])
  useEffect(() => {
    document.body.classList.toggle('permit-navigation-collapsed', collapsed)
    try { localStorage.setItem('permitNavCollapsed', String(collapsed)) } catch {}
  }, [collapsed])
  useEffect(() => {
    const revealSection = () => {
      setHash(window.location.hash)
      if (['#finalReviews','#buildingReview','#occupancyReview'].includes(window.location.hash)) setSectionsOpen(value=>({...value,reviews:true}))
    }
    window.addEventListener('hashchange', revealSection)
    return () => window.removeEventListener('hashchange', revealSection)
  }, [])
  useEffect(() => {
    if (!mobile || !open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('button')?.focus()
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const items = Array.from(panel.current.querySelectorAll('a,button:not(:disabled)')).filter(el => el.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', keyboard) }
  }, [mobile, open])
  const link = (href, label, icon, selected = false) => <a href={href} className={`permit-nav-link${selected ? ' is-current' : ''}`} aria-current={selected ? 'page' : undefined} aria-label={label} title={label}><Icon name={icon}/><span>{label}</span>{selected && <i aria-hidden="true"/>}</a>
  const reviewSelected = dashboard && ['#finalReviews','#buildingReview','#occupancyReview'].includes(hash)
  const section = (key, label, icon, children, active = false) => {
    const visible = sectionsOpen[key] && (mobile || !collapsed)
    return <div className="permit-nav-section">
      <button type="button" className={`permit-nav-link permit-nav-section-toggle${active?' is-current-group':''}`} aria-label={label} title={label} aria-expanded={visible} aria-controls={`permit-nav-${key}-links`} onClick={() => {
        if(collapsed && !mobile){setCollapsed(false);setSectionsOpen(value=>({...value,[key]:true}))}
        else setSectionsOpen(value=>({...value,[key]:!value[key]}))
      }}><Icon name={icon}/><span>{label}</span><span className="permit-nav-section-chevron" aria-hidden="true"><Icon name="chevron"/></span></button>
      <div id={`permit-nav-${key}-links`} className="permit-nav-submenu" role="group" aria-label={label} hidden={!visible}>{children}</div>
    </div>
  }
  return <>
    <button ref={trigger} className="permit-nav-mobile" type="button" aria-label="Open workspace navigation" aria-controls="permit-navigation-panel" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu"/><span>Workspaces</span></button>
    {mobile && open && <div className="permit-nav-backdrop" onClick={close} aria-hidden="true"/>}
    <aside ref={panel} id="permit-navigation-panel" className={`permit-sidebar${occupancy ? ' is-occupancy' : ''}${mobile && open ? ' is-open' : ''}`} role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label={superadmin ? 'User management navigation' : 'Permit workspace navigation'} inert={mobile && !open ? true : undefined}>
      <div className="permit-nav-heading"><div className="permit-nav-identity"><img src="/assets/laoag-city-official-seal.png" alt="Laoag City official seal"/><div className="permit-nav-identity-copy"><strong>{title}</strong><span>Office of the City Engineer<br/>Laoag City</span></div></div><button type="button" aria-label={mobile ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={mobile ? open : !collapsed} aria-controls="permit-navigation-links" title={mobile ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => mobile ? close() : setCollapsed(!collapsed)}><Icon name={mobile ? 'close' : 'collapse'}/></button></div>
      <nav id="permit-navigation-links" aria-label={superadmin ? 'Account management' : 'Permit workspaces'} onClick={event => { if (mobile && event.target.closest('a')) close() }}>
        <p className="permit-nav-label">{superadmin ? 'USER MANAGEMENT' : 'WORKSPACES'}</p>
        {dashboard || admin ? <>{link(dashboard ? '#adminOverview' : '/admin#adminOverview', 'Overview', 'home', admin && dashboard && !reviewSelected)}{admin && <>
          {section('reviews','Reviews & Requests','requests',<>
            {link('/approval-inbox', 'Approval Inbox', 'inbox', inbox)}
            {link(dashboard ? '#finalReviews' : '/admin#finalReviews', 'Final Project Review', 'building', dashboard && hash==='#finalReviews')}
            {link(dashboard ? '#buildingReview' : '/admin#buildingReview', 'Building Requests', 'building', dashboard && hash==='#buildingReview')}
            {link(dashboard ? '#occupancyReview' : '/admin#occupancyReview', 'Occupancy Requests', 'home', dashboard && hash==='#occupancyReview')}
          </>,inbox || reviewSelected)}
          {section('registries','Permit Registries','registry',<>
            {link('/index.html', 'Building Permits', 'building', !dashboard && !monthly && !inbox && !occupancy)}
            {link('/occupancy', 'Occupancy Permits', 'home', !dashboard && !monthly && !inbox && occupancy)}
          </>,!dashboard && !monthly && !inbox)}
          {section('reports','Reports','reports',link('/monthly-reports', 'Monthly Reports', 'reports', monthly),monthly)}
        </>}{superadmin && <>{link('#accountSection', 'Account Requests', 'people')}{link('#accountListSection', 'Manage Accounts', 'people')}</>}</> : <>{link('/index.html', 'Building Permits', 'building', !occupancy)}{link('/occupancy', 'Occupancy Permits', 'home', occupancy)}</>}
        <p className="permit-nav-label" style={{marginTop:24}}>ACCOUNT</p>
        {['People', 'My Profile'].map(label => <button key={label} type="button" className="permit-nav-link" title={label} aria-label={label} onClick={() => { if(mobile) close(); window.dispatchEvent(new CustomEvent('permit-account-panel', {detail:label === 'People' ? 'people' : 'profile'})) }}><Icon name={label === 'People' ? 'people' : 'profile'}/><span>{label}</span></button>)}
        <button type="button" className="permit-nav-link context-help-guide" title="Walkthrough" aria-label="Walkthrough" aria-haspopup="dialog" onClick={event => { const opener=mobile?trigger.current:event.currentTarget; if(mobile) close(); window.dispatchEvent(new CustomEvent('system-walkthrough',{detail:{opener}})) }}><Icon name="help"/><span>Walkthrough</span></button>
        <p className="permit-nav-label" style={{marginTop:24}}>Appearance</p>
        <div className="permit-nav-appearance" data-appearance-target="sidebar"/>
      </nav>
      <div className="permit-nav-footer">
        <button type="button" className="permit-nav-link permit-nav-logout" title="Log out" aria-label="Log out" disabled={signingOut} onClick={async () => { setSigningOut(true); try { await window.PermitRouting.logout() } finally { setSigningOut(false) } }}><Icon name="logout"/><span>{signingOut ? 'Signing out…' : 'Log out'}</span></button>
        <p className="permit-nav-caption">City Government of Laoag</p>
      </div>
    </aside>
  </>
}
