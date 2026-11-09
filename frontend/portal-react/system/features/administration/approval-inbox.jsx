import React,{useEffect,useRef,useState} from 'react'
import {ArrowUpRight,CircleCheck,FilePenLine,Inbox,RefreshCw,Trash2} from 'lucide-react'
import FinalReviews,{PermitTypeBadge} from './FinalReviews'
import css from './approval-inbox.css?inline'

const kinds=['permits','occupancy']
const label=kind=>kind==='permits'?'Building':'Occupancy'
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
const reference=item=>item.bulk?`${item.record_count} records`:`${item.kind==='permits'?'BP':'OP'}-${item.projectId}`
const typeLabel=item=>item.type==='final'?'Final approval':item.bulk?'Delete All':item.change_type==='inspection_delete'?'Inspection deletion':item.type==='deletion'?'Permit deletion':item.change_type==='permit_update'?'Permit edit':'Earlier edit request'
function timestamp(value){
  if(!value)return Infinity
  const text=String(value),office=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)?text.replace(' ','T')+'+08:00':text
  const time=Date.parse(office);return Number.isFinite(time)?time:Infinity
}
function submitted(value){const time=timestamp(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(time)):'Submission date unavailable'}
function parseChanges(request){try{const changes=typeof request.changes==='string'?JSON.parse(request.changes):request.changes;return changes&&typeof changes==='object'&&!Array.isArray(changes)?changes:null}catch{return null}}
function preview(request){
  const changes=parseChanges(request)
  let error=''
  if(!['delete','bulk_delete','inspection_delete','permit_update'].includes(request.change_type)||(request.change_type==='permit_update'&&request.kind!=='permits'))error='This earlier request type cannot be approved here. Decline it and ask the operator to use the current workflow.'
  else if(request.change_type!=='delete'&&!changes)error='The submitted details are unreadable. Decline this request and ask the operator to resubmit.'
  else if(request.bulk&&(!Array.isArray(changes.projects)||!changes.projects.length||changes.projects.some(project=>!positive(project.id))||changes.projects.length!==Number(request.record_count)))error='The recorded deletion scope is incomplete. Decline this request and ask the operator to resubmit.'
  else if(request.change_type==='permit_update'&&!changes._baseSnapshot)error='This older request has no version snapshot and cannot be safely approved. Ask the operator to submit a fresh request.'
  if(typeof window.renderApprovalChanges!=='function')return {error:'The request preview is unavailable. Refresh the page before reviewing requests.',html:''}
  if(error)return {error,html:''}
  return {error:'',html:window.renderApprovalChanges(request)}
}
async function api(url,options={}){
  const write=options.method&&options.method!=='GET',transport=write&&window.RequestFeedback?.fetch?window.RequestFeedback.fetch:window.fetch
  const response=await transport(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-permit-request':'1',...options.headers}})
  let data;try{data=await response.json()}catch{throw Error('The review service returned an unreadable response. Refresh before trying again.')}
  if(data.cancelled)return data
  if(!response.ok||data.success!==true)throw Object.assign(Error(data.message||'Approval requests could not be loaded. Please retry.'),{status:response.status,conflict:data.conflict===true})
  return data
}
async function pending(kind,signal){const data=await api(`/api/${kind}/change-requests/pending`,{signal});if(!Array.isArray(data.requests))throw Error('The pending request response is incomplete. Please refresh.');return data.requests}
function collect(building,occupancy,finals){
  const requests=[...building.map(request=>({...request,kind:'permits'})),...occupancy.map(request=>({...request,kind:'occupancy'}))].map(request=>{
    const bulk=request.bulk===true||request.change_type==='bulk_delete',projectId=request.kind==='permits'?request.permit_id:request.occupancy_id
    if(!positive(request.id)||request.status!=='pending'||(!bulk&&!positive(projectId)))throw Error('The pending request response is incomplete. Please refresh.')
    return {...request,bulk,projectId,key:`request:${request.kind}:${bulk?'bulk:':''}${request.id}`,type:bulk||String(request.change_type).includes('delete')?'deletion':'edit'}
  })
  for(const project of finals){
    if(!kinds.includes(project.kind)||!positive(project.id)||!project.final_approval)throw Error('The final review response is incomplete. Please refresh.')
    if(project.final_approval.status==='ready'&&project.final_approval.ready===true)requests.push({...project,projectId:project.id,key:`final:${project.kind}:${project.id}`,type:'final',created_at:null})
  }
  return requests.sort((a,b)=>{const first=timestamp(a.created_at),second=timestamp(b.created_at);return (first===second?0:first<second?-1:1)||a.key.localeCompare(b.key)})
}

export default function ApprovalInbox(){
  let admin=false;try{admin=JSON.parse(sessionStorage.getItem('oboUser')||'null')?.role==='admin'}catch{}
  const [items,setItems]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[openError,setOpenError]=useState(''),[revision,setRevision]=useState(0),[type,setType]=useState('all'),[kind,setKind]=useState('all'),[page,setPage]=useState(1)
  const [selected,setSelected]=useState(null),[opening,setOpening]=useState(false),[busy,setBusy]=useState(false),[decision,setDecision]=useState(''),[confirmation,setConfirmation]=useState(''),[reviewError,setReviewError]=useState(''),[result,setResult]=useState(''),[finished,setFinished]=useState(false),[needsRefresh,setNeedsRefresh]=useState(false)
  const dialog=useRef(null),finalReview=useRef(null),opener=useRef(null),refreshButton=useRef(null),flight=useRef(false),confirmButton=useRef(null),confirmationInput=useRef(null),notice=useRef(null)
  useEffect(()=>{const changed=()=>setRevision(value=>value+1);window.addEventListener('admin-data-changed',changed);return()=>window.removeEventListener('admin-data-changed',changed)},[])
  useEffect(()=>{
    if(!admin){setLoading(false);return}
    const controller=new AbortController();setLoading(true);setError('')
    Promise.all([pending('permits',controller.signal),pending('occupancy',controller.signal),api('/api/final-reviews',{signal:controller.signal})])
      .then(([building,occupancy,finals])=>{if(!Array.isArray(finals.projects))throw Error('The final review response is incomplete. Please refresh.');const records=collect(building,occupancy,finals.projects);if(!controller.signal.aborted)setItems(records)})
      .catch(failure=>{if(!controller.signal.aborted){setError(failure.message);setItems(null)}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[admin,revision])
  useEffect(()=>{if(decision){if(selected?.bulk&&decision==='approve')confirmationInput.current?.focus();else confirmButton.current?.focus()}},[decision])
  useEffect(()=>{if(reviewError||result)notice.current?.scrollIntoView?.({block:'nearest'})},[reviewError,result])
  const refresh=()=>setRevision(value=>value+1)
  async function current(item){
    const requests=await pending(item.kind),request=requests.find(row=>Number(row.id)===Number(item.id)&&(row.bulk===true||row.change_type==='bulk_delete')===item.bulk)
    if(!request)throw Error('This request is no longer pending. Refresh the inbox to see the latest requests.')
    return {...item,...request,kind:item.kind}
  }
  async function open(item,event){
    if(flight.current||loading)return
    flight.current=true;setOpening(true);setOpenError('');opener.current=event.currentTarget
    try{
      if(item.type==='final'){await finalReview.current.open({kind:item.kind,id:item.projectId},event.currentTarget);return}
      const latest=await current(item);setSelected(latest);setDecision('');setConfirmation('');setReviewError('');setResult('');setFinished(false);setNeedsRefresh(false);dialog.current.showModal()
    }catch(failure){setOpenError(failure.message);refresh()}finally{flight.current=false;setOpening(false)}
  }
  function close(event){event?.preventDefault();if(flight.current)return;dialog.current.close();setSelected(null);setDecision('');(opener.current?.isConnected?opener.current:refreshButton.current)?.focus()}
  async function reloadReview(){
    if(flight.current||!selected)return
    flight.current=true;setBusy(true);setDecision('');setConfirmation('');setReviewError('')
    try{setSelected(await current(selected));setNeedsRefresh(false)}catch(failure){setReviewError(failure.message);setNeedsRefresh(true)}finally{flight.current=false;setBusy(false);refresh()}
  }
  async function decide(){
    if(flight.current||!selected||finished||needsRefresh||!decision)return
    if(decision==='approve'&&(preview(selected).error||(selected.bulk&&confirmation!=='DELETE ALL')))return
    flight.current=true;setBusy(true);setReviewError('');setResult('')
    const action=decision,request=selected
    try{
      const url=request.bulk?`/api/permit-deletions/${request.kind}/${request.id}/${action}`:`/api/${request.kind}/change-requests/${request.id}/${action}`
      const saved=await api(url,{method:'PUT',body:JSON.stringify(request.bulk?{confirmation:action==='approve'?'DELETE ALL':undefined}:{remarks:'Rejected by administrator.'})})
      if(saved.cancelled){setResult('Review cancelled. No changes were saved.');return}
      setResult(saved.message||(action==='approve'?'Request approved.':'Request declined.'));setFinished(true);window.dispatchEvent(new Event('admin-data-changed'))
    }catch(failure){setReviewError(failure.message);setNeedsRefresh(true);window.dispatchEvent(new Event('admin-data-changed'))}
    finally{flight.current=false;setBusy(false);setDecision('');setConfirmation('')}
  }
  if(!admin)return <main className="container ai-page"><style>{css}</style><h1>Approval inbox</h1><p role="alert">The approval inbox is available to engineering admins.</p></main>
  const totals=items?{all:items.length,edit:items.filter(item=>item.type==='edit').length,deletion:items.filter(item=>item.type==='deletion').length,final:items.filter(item=>item.type==='final').length}:null
  const filtered=(items||[]).filter(item=>(type==='all'||item.type===type)&&(kind==='all'||item.kind===kind)),pages=Math.max(1,Math.ceil(filtered.length/20)),currentPage=Math.min(page,pages),visible=filtered.slice((currentPage-1)*20,currentPage*20),details=selected?preview(selected):null
  return <><style>{css}</style><header className="site-header ai-site-header"><div className="brand"><img src="/assets/laoag-city-official-seal.png" alt="Laoag City official seal"/><div><strong>Office of the City Engineer</strong><span>City Government of Laoag</span></div></div><span>Engineering administration</span></header>
    <main className="container ai-page">
      <div className="ai-heading"><div><p className="ai-kicker">ADMINISTRATION / REVIEWS</p><h1>Approval inbox</h1><p>Building and occupancy requests awaiting your review.</p></div><button type="button" ref={refreshButton} onClick={refresh} disabled={loading||opening||busy}><RefreshCw aria-hidden="true"/>Refresh</button></div>
      {loading&&<p role="status">Loading approval requests…</p>}{error&&<p role="alert" className="ai-error">{error}</p>}{openError&&<p role="alert" className="ai-error">{openError}</p>}
      {totals&&!loading&&!error&&<div className="ai-stats">{[['all','All pending','Requests awaiting review',Inbox],['edit','Permit edits','Proposed record changes',FilePenLine],['deletion','Deletions','Permit and inspection requests',Trash2],['final','Final approvals','Ready for final review',CircleCheck]].map(([key,title,note,Icon])=><article key={key} className={'ai-stat is-'+key}><div><span>{title}</span><Icon aria-hidden="true"/></div><strong>{totals[key]}</strong><p>{note}</p></article>)}</div>}
      <section className="ai-panel" aria-label="Pending approvals" aria-busy={loading}>
        <div className="ai-tabs" role="group" aria-label="Request type">{[['all','All requests'],['edit','Edits'],['deletion','Deletions'],['final','Final approval']].map(([key,title])=><button id={'ai-tab-'+key} type="button" key={key} aria-pressed={type===key} onClick={()=>{setType(key);setPage(1)}}>{title}{totals&&!loading&&!error&&<span>{totals[key]}</span>}</button>)}</div>
        <div className="ai-filters"><label htmlFor="approvalInboxKind">Permit type<select id="approvalInboxKind" value={kind} onChange={event=>{setKind(event.target.value);setPage(1)}}><option value="all">Building and Occupancy</option><option value="permits">Building only</option><option value="occupancy">Occupancy only</option></select></label><span>Oldest submitted requests first · Final reviews follow</span></div>
        {!loading&&!error&&items&&<><div className="ai-list">{visible.map(item=><article className="ai-request" key={item.key}><div><div className="ai-meta"><PermitTypeBadge kind={item.kind}/><span>{reference(item)}</span><span className={'ai-type is-'+item.type}>{typeLabel(item)}</span></div><h2>{item.project_title||`${label(item.kind)} permit`}</h2><div className="ai-requester">{item.type==='final'?<span>All required stations approved · No separate submission needed</span>:<><span>Requested by <strong>{item.requested_by_name||'Display name unavailable'}</strong></span><time>{submitted(item.created_at)}</time></>}</div></div><button type="button" disabled={opening||busy} onClick={event=>open(item,event)} aria-label={`Review ${item.project_title||reference(item)}`}>Review<ArrowUpRight aria-hidden="true"/></button></article>)}{!visible.length&&<p className="ai-empty">{!items.length?'You’re caught up. No pending requests or projects ready for final review.':'No pending requests match these filters.'}</p>}</div><div className="ai-pagination"><span>{filtered.length} pending {filtered.length===1?'request':'requests'} · Page {currentPage} of {pages}</span><div><button type="button" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</button><button type="button" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></div></>}
      </section>
      <FinalReviews ref={finalReview} dialogOnly/>
    </main>
    <dialog ref={dialog} className="ai-dialog" onCancel={close} aria-labelledby="ai-review-title">
      <div className="ai-dialog-heading"><div>{selected&&<div className="ai-meta"><PermitTypeBadge kind={selected.kind}/><span>{reference(selected)}</span><span className={'ai-type is-'+selected.type}>{typeLabel(selected)}</span></div>}<h2 id="ai-review-title">{selected?.project_title}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close request review">×</button></div>
      {selected&&<div className="ai-dialog-body"><p className="ai-dialog-requester">Requested by <strong>{selected.requested_by_name||'Display name unavailable'}</strong> · {submitted(selected.created_at)} · Request #{selected.id}</p>
        {details.error?<p className="ai-error" role="alert">{details.error}</p>:<div className="ai-changes" dangerouslySetInnerHTML={{__html:details.html}}/>}
        <div className="ai-notice" ref={notice} aria-live="polite">{result&&<p className="ai-success" role="status">{result}</p>}{reviewError&&<p className="ai-error" role="alert">{reviewError}</p>}{busy&&<p role="status">Saving your decision…</p>}{needsRefresh&&!busy&&<button type="button" onClick={reloadReview}>Refresh request details</button>}</div>
        {!finished&&(decision?<section className="ai-confirm" aria-labelledby="ai-confirm-title"><h3 id="ai-confirm-title">{decision==='reject'?'Decline this request?':selected.type==='deletion'?'Confirm permanent deletion':'Approve these changes?'}</h3><p>{decision==='reject'?'Declining retains the current permit records.':selected.bulk?`Permanently delete the ${selected.record_count} ${label(selected.kind).toLowerCase()} permit records listed in this request and their related records? Newly created records outside this request are excluded.`:selected.change_type==='inspection_delete'?'Permanently delete only the listed inspection? The parent permit will remain.':selected.type==='deletion'?'Permanently delete this permit and its related records? This cannot be undone.':'Apply the proposed changes to this permit? The server will check that the request is still current.'}</p>
          {selected.bulk&&decision==='approve'&&<label>Type DELETE ALL to confirm<input ref={confirmationInput} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} aria-label="Type DELETE ALL to confirm"/></label>}
          <div className="ai-actions"><button type="button" disabled={busy} onClick={()=>{setDecision('');setConfirmation('')}}>Cancel</button><button type="button" ref={confirmButton} className={decision==='approve'&&selected.type==='deletion'?'ai-danger':'ai-primary'} disabled={busy||(selected.bulk&&decision==='approve'&&confirmation!=='DELETE ALL')} onClick={decide}>{busy?'Saving…':decision==='reject'?'Confirm decline':selected.type==='deletion'?'Approve and delete permanently':'Confirm approval'}</button></div>
        </section>:<div className="ai-actions"><button type="button" disabled={busy||needsRefresh} onClick={()=>{setDecision('reject');setReviewError('');setResult('')}}>Decline request</button><button type="button" className={selected.type==='deletion'?'ai-danger':'ai-primary'} disabled={busy||needsRefresh||!!details.error} onClick={()=>{setDecision('approve');setReviewError('');setResult('')}}>{selected.type==='deletion'?'Approve deletion':'Approve edit'}</button></div>)}
      </div>}
    </dialog>
  </>
}
