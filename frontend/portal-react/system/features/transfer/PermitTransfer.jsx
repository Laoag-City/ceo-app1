/** Independent React island: registries expose filtered IDs; legacy controllers
 * keep owning their tables. Server validates roles, CSV and duplicate checks.
 */
import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import transferCss from './permit-transfer.css?inline'

export default function PermitTransfer({page}) {
  const admin=page==='permits-superadmin'
  let superadmin=false;try{superadmin=JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.role==='superadmin'}catch{}
  const enabled=!superadmin && (admin||['permits-index','permits-occupancy'].includes(page))
  const [target,setTarget]=useState(null),[open,setOpen]=useState(false)
  const [kind,setKind]=useState(page==='permits-occupancy'?'occupancy':'permits')
  const [text,setText]=useState(''),[preview,setPreview]=useState(null),[duplicates,setDuplicates]=useState(false)
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false)
  const dialog=useRef(null),batch=useRef(null),lock=useRef(false)
  useEffect(()=>{
    if(!enabled)return
    const parent=document.querySelector(admin?'.topbar':'.registry-list-heading')
    if(!parent)return
    const mount=document.createElement('div');mount.className='permit-transfer-tools';parent.appendChild(mount);setTarget(mount)
    return()=>mount.remove()
  },[enabled,admin])
  useEffect(()=>{
    if(!open){dialog.current?.close();return}
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden';dialog.current?.showModal()
    return()=>{document.body.style.overflow=previous}
  },[open])
  async function request(action,body) {
    let user;try{user=JSON.parse(sessionStorage.getItem('oboUser')||'null')}catch{}
    const response=await fetch(`/api/permit-transfer/${kind}/${action}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-permit-request':'1',...(user?{'x-user-id':String(user.id)}:{})},body:JSON.stringify(body)})
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'Could not complete the request. Please try again.')}
    return response
  }
  async function run(fn) {
    if(lock.current)return
    lock.current=true;setBusy(true);setMessage('')
    try{await fn()}catch(e){setMessage(e.message||'Connection interrupted. Retry the same submission; it will not create a second batch.')}
    finally{lock.current=false;setBusy(false)}
  }
  async function exportRecords(format='csv') {
    await run(async()=>{
      const ids=window.permitExportIds?.()
      if(!ids?.length)throw new Error('No matching records to export. Wait for the registry to load or adjust your filters.')
      const response=await request('export',{ids,format})
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a')
      link.href=url;link.download=`${kind}-${new Date().toISOString().slice(0,10)}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage(`Exported ${ids.length} matching records.`)
    })
  }
  function reset(){setPreview(null);setDuplicates(false);setDone(false);setMessage('');batch.current=null}
  async function readFile(event) {
    const file=event.target.files?.[0];setText('');reset()
    if(!file)return
    await run(async()=>{
      if(file.size>80000)throw new Error('Choose a CSV file up to 80 KB (100 records).')
      if(!/\.csv$/i.test(file.name))throw new Error('Choose a .csv file saved as CSV UTF-8.')
      const decoded=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())
      setText(decoded)
    })
  }
  const hasDuplicates=preview?.rows.some(r=>r.duplicates.length)
  if(!target)return null
  return createPortal(<>
    <style>{transferCss}</style>
    <button type="button" disabled={busy} onClick={()=>admin?setOpen(true):exportRecords()}>{admin?'Import permits':'Export CSV'}</button>
    {!admin&&<button type="button" disabled={busy} onClick={()=>exportRecords('xlsx')}>Export Excel (.xlsx)</button>}
    {!open&&message&&<span role="status">{message}</span>}
    {admin&&<dialog className="permit-transfer-dialog" aria-labelledby="permit-transfer-title" ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)setOpen(false)}}>
      <header><div><h2 id="permit-transfer-title">Import permits</h2><p>Preview first. Only new records are created.</p></div><button type="button" aria-label="Close import" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
      <div className="permit-transfer-body">
        <label>Permit type<select value={kind} disabled={busy||!!batch.current} onChange={e=>{setKind(e.target.value);setText('');reset()}}><option value="permits">Building permits</option><option value="occupancy">Occupancy permits</option></select></label>
        <section className="permit-transfer-guide" aria-labelledby="import-guide-title">
          <h3 id="import-guide-title">Before you upload</h3>
          <div className="permit-transfer-limits"><span>CSV UTF-8 only</span><span>1–100 records</span><span>80 KB maximum</span></div>
          <ul>
            <li><strong>Use the matching template.</strong> Keep its column names unchanged and fill every required field. Excel (.xlsx) reports cannot be imported.</li>
            <li><strong>Dates:</strong> use YYYY-MM-DD, for example 2026-09-27. In Excel, format the date cells this way before saving as CSV UTF-8.</li>
            {kind==='permits'&&<li><strong>Lots:</strong> enter 1–30 distinct lots, separated by a vertical bar: <code>Lot 1 | Lot 2</code>. Each lot allows up to 100 characters.</li>}
            <li><strong>Text limits:</strong> up to 255 characters per text field{kind==='occupancy'?', except BP reference: 100 characters':''}. Use plain text without angle brackets.</li>
            <li><strong>Review the preview.</strong> Invalid rows block the whole file. Repeated project names within the file are blocked; possible existing duplicates need your review and acknowledgement.</li>
          </ul>
          <p>Preview saves nothing. Confirm creates new permits with automatic BP/OP IDs; it never overwrites existing permits. Routing, inspections, Remarks and Logs are not imported.</p>
        </section>
        <a href={`/api/permit-transfer/${kind}/template`} download>Download CSV template</a>
        <label>CSV file<input key={kind} type="file" accept=".csv,text/csv" disabled={busy||!!batch.current} onChange={readFile}/></label>
        <button type="button" disabled={busy||!text||!!batch.current} onClick={()=>run(async()=>{setPreview(null);setDuplicates(false);setDone(false);const response=await request('preview',{csv:text});setPreview(await response.json())})}>Preview import</button>
        {preview&&<>
          <h3>{preview.rows.length} records · {preview.rows.filter(r=>r.errors.length).length} invalid</h3>
          <div className="permit-transfer-preview"><table><thead><tr><th>CSV row</th><th>Project</th><th>Owner</th><th>Location</th><th>Date</th><th>{kind==='permits'?'Designer / lots':'BP reference'}</th><th>Review</th></tr></thead><tbody>{preview.rows.map(row=><tr key={row.row}><td>{row.row}</td><td>{row.data.project_title}</td><td>{row.data.owner_name}</td><td>{row.data.location}</td><td>{row.data.permit_date||row.data.date_applied}</td><td>{kind==='permits'?`${row.data.designer_name} / ${row.data.lot_numbers}`:row.data.bp_reference_no}</td><td>{row.errors.join('; ')||'Valid'}{row.duplicates.length>0&&<strong> Possible duplicate: {row.duplicates.join(', ')}</strong>}</td></tr>)}</tbody></table></div>
          {hasDuplicates&&<label className="permit-transfer-check"><input type="checkbox" checked={duplicates} disabled={busy||!!batch.current} onChange={e=>setDuplicates(e.target.checked)}/>I reviewed the possible duplicates and confirm these are separate new records.</label>}
          <button type="button" disabled={busy||done||!preview.valid||(hasDuplicates&&!duplicates)} onClick={()=>run(async()=>{
            // Keep this exact request after network uncertainty, including dialog close.
            if(!batch.current)batch.current={requestId:crypto.randomUUID(),csv:text,version:preview.version,allowDuplicates:duplicates}
            const response=await request('import',batch.current),result=await response.json()
            setDone(true);setMessage(`Imported ${result.ids.length} records: ${result.ids.map(id=>(kind==='permits'?'BP-':'OP-')+String(id)).join(', ')}. Refresh the registry to see them.`)
          })}>{busy?'Working…':batch.current&&!done?'Retry same import':`Confirm import (${preview.rows.length})`}</button>
        </>}
        {message&&<p role="status" className="permit-transfer-message">{message}</p>}
        {(done||batch.current)&&<button type="button" disabled={busy} onClick={()=>{if(done||window.confirm('If the connection failed, retry the same import first to check whether it saved. Start a fresh preview anyway?')){setText('');reset()}}}>Start another preview</button>}
      </div>
    </dialog>}
  </>,target)
}
