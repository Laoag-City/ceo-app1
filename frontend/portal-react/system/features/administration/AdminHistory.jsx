import React,{useEffect,useRef,useState} from 'react'

const sourceName=row=>row.source==='final_review'?'Final review':row.source==='activity'?(row.event_type==='bulk_delete'?'Bulk deletion request':row.event_type==='comment'?'Remark':'Activity'):'Request'
const when=value=>value?new Date(value).toLocaleString('en-PH'):'—'
function Entry({record}){
 const detail=record.details,hasDetails=record.remarks||record.reviewed_at||detail?.text||detail?.changes?.length||detail?.stations?.length
 return <article className="ao-history-entry">
  <div className="ao-history-entry-heading"><div><strong>{record.project_title}</strong><span>{record.kind==='permits'?'Building':'Occupancy'} · {record.project_id?`#${record.project_id} · `:''}{sourceName(record)} #{record.id}</span></div><span className="ao-status">{record.status==='unconfirmed'?'Outcome unconfirmed':record.status}</span></div>
  <p>{record.message}</p><div className="ao-history-meta">{record.actor_name} · {when(record.created_at)}</div>
  {hasDetails?<details><summary>See history details</summary>
   {record.reviewed_at&&<p>Reviewed {when(record.reviewed_at)}{record.reviewed_by?` · ${record.reviewed_by}`:''}</p>}
   {record.remarks&&<p className="ao-history-remarks">{record.remarks}</p>}
   {detail?.text&&<p className="ao-history-remarks">{detail.text}</p>}
   {detail?.changes?.map((change,index)=><div className="ao-history-change" key={index}><strong>{change.field}</strong><div><span>Before: {change.before || 'Empty'}</span><span>After: {change.after || 'Empty'}</span></div></div>)}
   {detail?.stations?.map(row=><section className="ao-history-station" key={row.id}><strong>{row.station}{row.sub_permit?` · ${row.sub_permit}`:''}</strong><p>{row.engineer || 'Unassigned'} · {row.status}</p><p>Date checked: {row.date_checked || '—'} · Date approved: {row.date_approved || '—'}</p>{row.remarks&&<p className="ao-history-remarks">{row.remarks}</p>}</section>)}
  </details>:null}
 </article>
}
export default function AdminHistory(){
 const [open,setOpen]=useState(false),[kind,setKind]=useState('all'),[source,setSource]=useState('all'),[query,setQuery]=useState(''),[reload,setReload]=useState(0)
 const [records,setRecords]=useState(null),[next,setNext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const dialog=useRef(null),opener=useRef(null),generation=useRef(0),older=useRef(null),reading=useRef(false)
 let user;try{user=JSON.parse(sessionStorage.getItem('oboUser') || 'null')}catch{}
 const params=()=>new URLSearchParams({kind,source,q:query.trim()})
 async function read(search,signal){
  const response=await fetch('/api/admin/history?'+search,{signal,credentials:'same-origin',cache:'no-store',headers:{'x-user-id':String(user?.id || '')}})
  let data;try{data=await response.json()}catch{throw Error('History is unavailable. Restart the permit server and refresh this page.')}
  if(!response.ok||!Array.isArray(data.records))throw Error(data.message || 'History could not be loaded. Please retry.')
  return data
 }
 useEffect(()=>{
  if(open)dialog.current.showModal();else if(dialog.current.open){dialog.current.close();opener.current?.focus()}
 },[open])
 useEffect(()=>{
  generation.current++;older.current?.abort();reading.current=false
  if(!open)return
  const controller=new AbortController();setRecords(null);setNext(null);setError('');setBusy(true)
  const timer=setTimeout(async()=>{
   try{const data=await read(params(),controller.signal);if(!controller.signal.aborted){setRecords(data.records);setNext(data.next)}}
   catch(error){if(!controller.signal.aborted)setError(error.message)}
   finally{if(!controller.signal.aborted)setBusy(false)}
  },200)
  return()=>{clearTimeout(timer);controller.abort();older.current?.abort()}
 },[open,kind,source,query,reload])
 async function loadOlder(){
  if(reading.current||busy||!next)return
  reading.current=true;setBusy(true);setError('');const current=generation.current,controller=new AbortController();older.current=controller
  try{
   const search=params();search.set('before',next);const data=await read(search,controller.signal)
   if(!controller.signal.aborted&&generation.current===current){setRecords(existing=>{const all=[...(existing || []),...data.records],seen=new Set();return all.filter(row=>{const key=`${row.source}:${row.kind}:${row.id}`;if(seen.has(key))return false;seen.add(key);return true})});setNext(data.next)}
  }catch(error){if(!controller.signal.aborted&&generation.current===current)setError(error.message)}
  finally{if(generation.current===current){reading.current=false;setBusy(false)}}
 }
 function close(event){event?.preventDefault();setOpen(false)}
 return <>
  <button className="ao-history-launch" type="button" onClick={event=>{opener.current=event.currentTarget;setOpen(true)}}>View full history</button>
  <dialog ref={dialog} className="ao-history-dialog" aria-labelledby="admin-history-title" onCancel={close}>
   <header className="ao-history-heading"><div><h2 id="admin-history-title">Permit history</h2><p>Past requests, station activity, remarks, and final reviews.</p></div><button type="button" aria-label="Close history" onClick={close}>×</button></header>
   <div className="ao-history-filters"><label>Permit<select value={kind} onChange={event=>setKind(event.target.value)}><option value="all">Both permits</option><option value="permits">Building</option><option value="occupancy">Occupancy</option></select></label><label>Record type<select value={source} onChange={event=>setSource(event.target.value)}><option value="all">All history</option><option value="request">Requests</option><option value="activity">Activity and remarks</option><option value="final_review">Final reviews</option></select></label><label className="ao-history-search">Find records<input type="search" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Project, ID, or person"/></label><button type="button" disabled={busy} onClick={()=>setReload(value=>value+1)}>Refresh</button></div>
   <div className="ao-history-feed">
    {error&&<p className="ao-error" role="alert">{error}</p>}
    {records?.map(record=><Entry key={`${record.source}:${record.kind}:${record.id}`} record={record}/>)}
    {!busy&&records?.length===0&&<p>No history matches this view.</p>}
    {busy&&<p role="status">Loading history…</p>}
    {!busy&&!records&&error&&<button type="button" onClick={()=>setReload(value=>value+1)}>Retry</button>}
    {next&&<button className="ao-history-more" type="button" onClick={loadOlder} disabled={busy}>Load older records</button>}
   </div>
  </dialog>
 </>
}
export {sourceName}
