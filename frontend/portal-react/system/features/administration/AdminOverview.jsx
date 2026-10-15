import React,{useEffect,useState} from 'react'
import css from './admin-overview.css?inline'
import AdminHistory,{sourceName} from './AdminHistory'

function SummaryIcon({type}){
  const icons={
    building:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/></>,
    occupancy:<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>,
    pending:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    deletion:<><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6"/></>,
    accounts:<><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
    pendingAccounts:<><circle cx="9" cy="6" r="3"/><path d="M2 21v-4a7 7 0 0 1 11-5"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1"/></>
  }
  return <span className="ao-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">{icons[type]}</svg></span>
}

function SummaryCard({label,value,detail,type,tone}){
  return <article className={tone?`ao-${tone}`:undefined}>
    <div className="ao-stat-body"><div className="ao-stat-heading"><span>{label}</span><SummaryIcon type={type}/></div><strong>{value}</strong></div>
    <small className="ao-stat-footer">{detail}</small>
  </article>
}

// Own only this overview; existing controllers retain their approval panels.
export default function AdminOverview(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0),[updated,setUpdated]=useState('')
  useEffect(()=>{
    let timer
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>setVersion(v=>v+1),250)}
    window.addEventListener('admin-data-changed',refresh)
    return()=>{clearTimeout(timer);window.removeEventListener('admin-data-changed',refresh)}
  },[])
  useEffect(()=>{
    const controller=new AbortController()
    setLoading(true);setError('')
    let user;try{user=JSON.parse(sessionStorage.getItem('oboUser')||'null')}catch{}
    fetch('/api/admin/overview',{signal:controller.signal,headers:{'x-user-id':String(user?.id||'')}})
      .then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.message||'Unable to load dashboard.');if(!result.totals||!Array.isArray(result.recent))throw new Error('Unable to load dashboard.');return result})
      .then(result=>{setData(result);setUpdated(new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}))})
      .catch(e=>{if(e.name!=='AbortError'){setError(e.message);setData(null)}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[version])
  const go=selector=>{const el=document.querySelector(selector);if(el){el.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});el.setAttribute('tabindex','-1');el.focus({preventScroll:true})}}
  const t=data?.totals
  const pending=t?Number(t.buildingPending)+Number(t.occupancyPending):0
  let isIT=false;try{isIT=JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.role==='superadmin'}catch{}
  if(isIT)return <section className="admin-overview" aria-label="Account overview"><style>{css}</style><div className="ao-heading"><div><h2>Account access</h2><p>IT manages accounts, roles, activation, and station assignments.</p></div><button onClick={()=>setVersion(v=>v+1)} disabled={loading}>Refresh overview</button></div>{error && <p role="alert">{error}</p>}<div className="ao-stats" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}><SummaryCard label="Accounts" value={t?.accounts ?? '—'} detail="Registered users" type="accounts"/><SummaryCard label="Pending accounts" value={t?.pendingAccounts ?? '—'} detail="Awaiting IT activation" type="pendingAccounts" tone="amber"/></div><p className="ao-empty">An operator can update only their assigned station. Unassigned operators have view access.</p><button className="ao-directory" onClick={()=>go('#accountListSection')}>Manage accounts and stations</button></section>
  return <section className="admin-overview" aria-label="Dashboard overview">
    <style>{css}</style>
    <div className="ao-heading"><div><h2>At a glance</h2><p>Permit records and requests awaiting your review.</p></div><div className="ao-refresh"><span>{loading?'Updating…':updated&&!error?`Updated ${updated}`:''}</span><button disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh overview</button></div></div>
    {error?<div role="alert" className="ao-error">{error}</div>:!t?<p role="status">Loading dashboard…</p>:<>
      <div className="ao-stats">
        <SummaryCard label="Building permits" value={Number(t.building).toLocaleString()} detail="Registered projects" type="building"/>
        <SummaryCard label="Occupancy permits" value={Number(t.occupancy).toLocaleString()} detail="Registered projects" type="occupancy" tone="green"/>
        <SummaryCard label="Pending reviews" value={pending.toLocaleString()} detail="Building and occupancy requests" type="pending" tone="amber"/>
        <SummaryCard label="Deletion requests" value={(Number(t.buildingDeletions)+Number(t.occupancyDeletions)).toLocaleString()} detail="Included in pending reviews" type="deletion" tone="red"/>
      </div>
      <div className="ao-panels"><section><h3>Needs your attention</h3><p>{pending?'Review requests using the panels below.':'You’re caught up on permit reviews.'}</p>
        <button className="ao-queue" onClick={()=>go('.building-review')}><span>Building permit reviews</span><strong>{t.buildingPending}</strong></button>
        <button className="ao-queue" onClick={()=>go('.occupancy-review')}><span>Occupancy permit reviews</span><strong>{t.occupancyPending}</strong></button>
        {t.pendingAccounts!==undefined&&<><button className="ao-queue" onClick={()=>go('#accountSection')}><span>Account requests</span><strong>{t.pendingAccounts} <span aria-hidden="true">→</span></strong></button><button className="ao-directory" onClick={()=>go('#accountListSection')}>Manage accounts ({t.accounts})</button></>}
      </section><section><h3>History</h3><p>Recent activity. Open full history to see older records and review details.</p>
        {data.recent.length?<ul className="ao-recent">{data.recent.map(r=><li key={`${r.source || 'request'}-${r.kind}-${r.id}`}><div><strong>{r.project_title}</strong><span>{r.kind==='permits'?'Building':'Occupancy'} · {r.source==='activity'?r.message:r.source==='final_review'?sourceName(r):String(r.event_type || r.change_type).replaceAll('_',' ')} · {new Date(r.created_at).toLocaleDateString('en-PH')}</span></div><span className="ao-status">{r.status}</span></li>)}</ul>:<p className="ao-empty">No permit history yet.</p>}
        <AdminHistory/>
      </section></div>
    </>}
  </section>
}
