import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react'
import css from './final-reviews.css?inline'

const date=value=>value?String(value).slice(0,10):'—'
export function PermitTypeBadge({kind}){
  const building=kind==='permits'
  return <span className={`fr-permit-badge ${building?'is-building':'is-occupancy'}`} title={building?'Building permit':'Occupancy permit'}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{building?<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/></>:<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>}</svg>
    {building?'Building':'Occupancy'}
  </span>
}
function StationTable({rows}){
  return <div className="fr-table"><table><thead><tr>{['Station','Assigned engineer','Status','Date checked','Date approved','Remarks'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.discipline_name}</td><td>{row.engineer_name || '—'}</td><td><span className={`fr-status is-${(row.signature_status || 'Pending').toLowerCase()}`}>{row.signature_status || 'Pending'}</span></td><td>{date(row.date_checked)}</td><td>{date(row.date_approved)}</td><td className="fr-remarks">{row.feedback_remarks || '—'}</td></tr>)}{!rows.length && <tr><td colSpan={6}>No stations configured.</td></tr>}</tbody></table></div>
}
const FinalReviews=forwardRef(function FinalReviews({dialogOnly=false},externalRef){
  const [projects,setProjects]=useState(null),[filter,setFilter]=useState('ready'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[error,setError]=useState(''),[remarks,setRemarks]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false)
  const [confirming,setConfirming]=useState(false),[reviewError,setReviewError]=useState(''),[result,setResult]=useState(''),[saving,setSaving]=useState(null),[needsRefresh,setNeedsRefresh]=useState(false)
  const approved=selected?.final_approval.status==='approved'
  const dialog=useRef(null),opener=useRef(null),inFlight=useRef(false),confirmation=useRef(null),confirmButton=useRef(null),approveButton=useRef(null),notice=useRef(null),feedback=useRef(null),refreshButton=useRef(null),restoreApprovalFocus=useRef(false)
  let user;try{user=JSON.parse(sessionStorage.getItem('oboUser') || 'null')}catch{}
  const headers={'Content-Type':'application/json','x-permit-request':'1','x-user-id':String(user?.id || '')}
  async function api(url,options={}){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{...headers,...options.headers}})
    let data;try{data=await response.json()}catch{throw Error('The review service is unavailable. Restart the permit server and refresh this page.')}
    if(!response.ok || data.success===false)throw Error(data.message || 'Review could not be loaded.');return data
  }
  async function refresh(){if(dialogOnly)return;setLoading(true);setError('');try{const data=await api('/api/final-reviews');if(!Array.isArray(data.projects))throw Error('Project reviews could not be loaded. Please retry.');setProjects(data.projects)}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{if(!dialogOnly)refresh()},[dialogOnly])
  // The inbox opens this same version-checked review; it does not own a second
  // final-approval implementation or give administrators station edit access.
  useImperativeHandle(externalRef,()=>({open:(project,element)=>open(project,{currentTarget:element})}))
  useEffect(()=>{if(confirming){confirmation.current?.scrollIntoView?.({block:'nearest'});confirmButton.current?.focus({preventScroll:true})}else if(restoreApprovalFocus.current){restoreApprovalFocus.current=false;approveButton.current?.focus()}},[confirming])
  useEffect(()=>{if(result || reviewError){notice.current?.scrollIntoView?.({block:'nearest'})}},[result,reviewError])
  async function readProject(project,options){
    const data=await api(`/api/${project.kind}/${project.id}`,options)
    if(options?.signal?.aborted)return
    if(!data.final_approval || !Array.isArray(data.final_approval.history) || !Array.isArray(data.matrix))throw Error('Project review details could not be loaded. Please refresh.')
    setSelected({...data,kind:project.kind});setNeedsRefresh(false)
  }
  async function open(project,event){
    if(inFlight.current)return
    inFlight.current=true;opener.current=event.currentTarget;setBusy(true);setError('');setRemarks('');setConfirming(false);setReviewError('');setResult('');setNeedsRefresh(false)
    const controller=new AbortController()
    const cancelLoad=()=>controller.abort()
    if(!dialogOnly)window.addEventListener('hashchange',cancelLoad,{once:true})
    try{
      await readProject(project,{signal:controller.signal})
      const element=dialog.current
      if(element && !controller.signal.aborted && !element.closest('[hidden]'))element.showModal()
    }catch(e){
      if(!controller.signal.aborted)setError(e.message)
    }finally{
      window.removeEventListener('hashchange',cancelLoad)
      inFlight.current=false;setBusy(false)
    }
  }
  function close(event){event?.preventDefault();if(inFlight.current)return;dialog.current.close();setSelected(null);setConfirming(false);(opener.current?.isConnected?opener.current:refreshButton.current)?.focus()}
  function askApproval(){if(inFlight.current || approved || !selected?.final_approval.ready || needsRefresh)return;setReviewError('');setResult('');setConfirming(true)}
  function cancelApproval(){restoreApprovalFocus.current=true;setConfirming(false)}
  async function reloadReview(){
    if(inFlight.current || !selected)return
    inFlight.current=true;setBusy(true);setReviewError('')
    try{await readProject(selected);await refresh();window.dispatchEvent(new Event('admin-data-changed'))}catch(e){setReviewError(e.message)}finally{inFlight.current=false;setBusy(false)}
  }
  async function decide(decision){
    if(inFlight.current || !selected || needsRefresh || approved)return
    if(decision==='approved' && (!confirming || !selected.final_approval.ready))return
    if(decision==='returned' && !remarks.trim()){setResult('');setReviewError('Add correction remarks before returning the project.');feedback.current?.focus();return}
    const project=selected
    inFlight.current=true;setBusy(true);setSaving(decision);setReviewError('');setResult('');setConfirming(false)
    try{
      const saved=await api(`/api/${project.kind}/${project.id}/final-review`,{method:'PUT',headers:{'x-record-version':project._version},body:JSON.stringify({decision,remarks:remarks.trim()})})
      if(saved.success!==true)throw Error('The server did not confirm your decision. Refresh the review before trying again.')
      setResult(saved.unchanged?(decision==='approved'?`${project.project_title} is already finally approved.`:`The same correction request is already recorded for ${project.project_title}.`):(decision==='approved'?`Final approval recorded for ${project.project_title}.`:`${project.project_title} was returned for correction. Your remarks have been recorded.`));setRemarks('');setNeedsRefresh(true)
      try{await readProject(project)}catch(e){setReviewError('Your decision was saved, but the latest project details could not be loaded. Refresh the review to continue.')}
      await refresh();window.dispatchEvent(new Event('admin-data-changed'))
    }catch(e){setReviewError(e.message);setNeedsRefresh(true);try{await readProject(project)}catch{}}
    finally{inFlight.current=false;setBusy(false);setSaving(null)}
  }
  const visible=(projects || []).filter(p=>(filter==='all'||p.final_approval.status===filter) && `${p.project_title} ${p.owner_name} ${p.location} ${p.kind==='permits'?'BP':'OP'}-${p.id}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section id="finalReviews" className={dialogOnly?'final-reviews ai-final-review':'card full-width final-reviews'}>
    <style>{css}</style>{!dialogOnly && <><div className="fr-heading"><div><p className="page-kicker">ADMIN REVIEW</p><h2>Final project approval</h2><p>Review every station before approving the project.</p></div><div className="fr-heading-actions"><button ref={refreshButton} type="button" onClick={refresh} disabled={loading || busy}>Refresh</button></div></div>
    <div className="fr-filters"><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ready">Ready for final review</option><option value="approved">Finally approved</option><option value="returned">Returned for correction</option><option value="all">All projects</option></select></label><label>Find a project<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Project, owner, address, or ID"/></label></div>
    {error && <p className="fr-error" role="alert">{error}</p>}
    {!projects?<p role="status">{loading?'Loading projects…':'Projects unavailable. Use Refresh to try again.'}</p>:<div className="fr-projects">{visible.map(p=><article key={`${p.kind}:${p.id}`}><div><div className="fr-project-meta"><PermitTypeBadge kind={p.kind}/><span className="fr-project-reference">#{p.id}</span></div><h3>{p.project_title}</h3><p>{p.owner_name} · {p.location}</p><strong className="fr-label">{p.final_approval.label}</strong></div><button type="button" onClick={e=>open(p,e)} disabled={busy}>Review project</button></article>)}{!visible.length && <p>No projects match this view.</p>}</div>}</>}
    {dialogOnly && error && <p className="fr-error" role="alert">{error}</p>}
    <dialog className="fr-dialog" ref={dialog} onCancel={close} onClose={()=>{if(!dialog.current?.open){setSelected(null);setConfirming(false)}}} aria-labelledby="fr-title">
      <div className="fr-heading"><div>{selected && <div className="fr-project-meta"><PermitTypeBadge kind={selected.kind}/><span className="fr-project-reference">#{selected.id}</span></div>}<h2 id="fr-title">{selected?.project_title}</h2></div><button type="button" aria-label="Close review" onClick={close} disabled={busy}>×</button></div>
      {selected && <div className="fr-dialog-body"><p className="fr-label">{selected.final_approval.label}</p><dl className="fr-meta"><div><dt>Owner</dt><dd>{selected.owner_name}</dd></div><div><dt>Location</dt><dd>{selected.location}</dd></div><div><dt>{selected.kind==='permits'?'Designer':'Building reference'}</dt><dd>{selected.designer_name || selected.bp_reference_no || '—'}</dd></div><div><dt>Date filed</dt><dd>{date(selected.permit_date || selected.date_applied)}</dd></div>{selected.lot_numbers && <div><dt>Lots</dt><dd>{selected.lot_numbers.join(', ') || '—'}</dd></div>}</dl>
        <h3>Main permit stations</h3><StationTable rows={selected.matrix}/>{(selected.sub_permits || []).map(sub=><section key={sub.id}><h3>Sub-permit: {sub.sub_project_title}</h3><StationTable rows={sub.matrix}/></section>)}
        {selected.final_approval.remarks && <p className="fr-returned">Correction requested: {selected.final_approval.remarks}</p>}
        {!approved && <label className="fr-feedback">Review remarks<textarea ref={feedback} rows={3} maxLength={4000} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Required when returning a project for correction" disabled={busy || needsRefresh || confirming}/></label>}
        <div ref={notice} className="fr-notice" aria-live="polite">
          {(result || saving) && <p className={result?'fr-success':'fr-saving'} role="status">{result || (saving==='approved'?'Saving final approval…':'Returning project for correction…')}</p>}
          {reviewError && <p className="fr-error" role="alert">{reviewError}</p>}
          {needsRefresh && !busy && <button type="button" onClick={reloadReview}>Refresh review details</button>}
        </div>
        {confirming?<section className="fr-confirm" ref={confirmation} aria-labelledby="fr-confirm-title"><h3 id="fr-confirm-title">Confirm final approval</h3><p>Give final approval to <strong>{selected.project_title}</strong>?</p><p>All required stations are approved. This records your final project approval in the review history.</p><div className="fr-actions"><button type="button" onClick={cancelApproval}>Cancel</button><button type="button" className="fr-primary" ref={confirmButton} onClick={()=>decide('approved')}>Confirm final approval</button></div></section>:<div className="fr-actions">{!approved && <button type="button" onClick={()=>decide('returned')} disabled={busy || needsRefresh}>{saving==='returned'?'Returning project…':'Return for correction'}</button>}<button type="button" className="fr-primary" ref={approveButton} onClick={askApproval} disabled={busy || needsRefresh || approved || !selected.final_approval.ready}>{saving==='approved'?'Saving final approval…':approved?'Finally approved':'Give final approval'}</button></div>}
        {approved && <p className="fr-help">Final approval is complete. This review is read-only until project or station details change.</p>}
        {!selected.final_approval.ready && selected.final_approval.status!=='approved' && <p className="fr-help">Final approval becomes available after every required station is approved and returned corrections have been saved.</p>}
        <details className="fr-history"><summary>Final review history ({selected.final_approval.history.length})</summary>{selected.final_approval.history.map(r=><article key={r.id}><strong>{r.decision==='approved'?'Final approval':r.decision==='returned'?'Returned for correction':'Fresh review required'}</strong><span>{r.reviewer_name} · {new Date(r.created_at).toLocaleString('en-PH')}</span>{r.remarks && <p>{r.remarks}</p>}{r.decision==='approved' && !r.current && <small>Earlier approval; does not approve the current project.</small>}</article>)}</details>
      </div>}
    </dialog>
  </section>
})
export default FinalReviews
