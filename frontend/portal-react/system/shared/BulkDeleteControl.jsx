import React, {useCallback, useEffect, useRef, useState} from 'react'

export default function BulkDeleteControl({kind}) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState(null), notice = useRef(null), status = useRef(null)
  const running = useRef(false), mounted = useRef(true), revision = useRef(0)
  let user; try { user = JSON.parse(sessionStorage.getItem('oboUser') || 'null') } catch {}
  const isAdmin = user?.role === 'admin'
  const label = kind === 'permits' ? 'Building' : 'Occupancy', url = '/api/permit-deletions/' + kind
  const headers = {'Content-Type': 'application/json', 'x-user-id': String(user?.id || ''), 'x-permit-request': '1'}
  useEffect(() => {
    if (!receipt) return
    const dialog = notice.current
    dialog.showModal(); dialog.querySelector('button').focus()
    return () => { if (dialog.open) dialog.close() }
  }, [receipt])
  function dismissNotice() {
    if (notice.current?.open) notice.current.close()
    setReceipt(null); status.current?.focus()
  }
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current
    const response = await window.RequestFeedback.fetch(url, {headers, cache: 'no-store'})
    const data = await response.json()
    if (!response.ok || !data.success) throw Error(data.message || 'Deletion request status could not be loaded.')
    if (mounted.current && revision.current === requestRevision) { setState(data); setError('') }
    return data
  }, [kind, user?.id])
  useEffect(() => {
    mounted.current = true
    if (!['operator','admin'].includes(user?.role)) return
    const reload = () => { if (!running.current) refresh().catch(e => { if (mounted.current) { setState(null); setError(e.message) } }) }
    reload(); window.addEventListener('focus', reload); window.addEventListener('permit-registry-changed', reload)
    return () => { mounted.current = false; window.removeEventListener('focus', reload); window.removeEventListener('permit-registry-changed', reload) }
  }, [refresh, user?.role])
  async function requestDeletion() {
    if (running.current || !state || (!isAdmin && state.pending) || !state.count) return
    running.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const latest = await refresh()
      if (!isAdmin && latest.pending) {
        setReceipt({duplicate:true, id:latest.pending.id, count:latest.pending.record_count})
        return
      }
      if (!latest.count) return
      let submitted
      const confirmed = await window.DestructiveAction.run({
        title: (isAdmin ? 'Permanently delete all ' : 'Request deletion of all ') + label.toLowerCase() + ' permits?',
        message: isAdmin
          ? 'This will permanently delete all ' + latest.count + ' ' + label.toLowerCase() + ' permit records and their related records immediately, including records outside your current search or filter. No admin approval request will be created. The other permit registry is unaffected.'
          : 'This will send a deletion request to the admin for review and confirmation. The request includes all ' + latest.count + ' ' + label.toLowerCase() + ' permit records in this registry, including records outside your current search or filter. No records will be deleted now. Records are deleted only after the admin approves the request. The other permit registry is unaffected.',
        requireText: 'DELETE ALL', confirmLabel: isAdmin ? 'Delete all permanently' : 'Send request to admin',
        action: async () => {
          const response = await window.RequestFeedback.fetch(url, {method: 'POST', headers, body: JSON.stringify({confirmation: 'DELETE ALL', version: latest.version})})
          const data = await response.json()
          if (!response.ok || !data.success) throw Error(data.message || 'Deletion request could not be submitted.')
          if (isAdmin && (!Number.isSafeInteger(data.deletedCount) || data.pending)) throw Error('Deletion was not confirmed. Refresh the registry before retrying.')
          submitted = isAdmin ? {deleted:true,count:data.deletedCount} : {duplicate:!!data.duplicate, id:data.request?.id ?? data.requestId, count:data.request?.record_count ?? data.count ?? latest.count}
          revision.current++; setMessage(data.message); setState(isAdmin ? {...latest,count:0,pending:null} : {...latest, pending: data.request || {id: data.requestId, record_count: data.count}})
          // A failed status refresh must not turn a committed submission into an
          // apparent failed write. The unique pending request also guards retries.
          refresh().catch(e => { if (mounted.current) setError(e.message) })
        }
      })
      // Show the receipt only after the server accepted the request and the
      // typed-confirmation dialog has closed. A status refresh is not a write.
      if (confirmed && submitted && mounted.current) {
        setReceipt(submitted)
        if (submitted.deleted) {
          Promise.resolve().then(() => kind === 'permits' ? window.getPermitLogs?.() : window.loadData?.()).catch(() => {
            if (mounted.current) setError('Deletion completed. Refresh the page to reload the registry.')
          })
          window.dispatchEvent(new Event('permit-registry-changed'))
        }
      }
    } catch (e) { setError(e.message) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  if (!['operator','admin'].includes(user?.role)) return null
  return <div className="registry-bulk-delete">
    <div className="registry-bulk-delete-copy">
      <p>{isAdmin ? 'Deletes immediately after confirmation' : 'Admin approval required'} · applies to the entire {label.toLowerCase()} registry</p>
      <p role="status" ref={status} tabIndex={-1}>{message || (!isAdmin && state?.pending ? `Deletion request #${state.pending.id} is awaiting admin review (${state.pending.record_count} records).` : state ? `${state.count} permit records` : error ? 'Deletion status unavailable.' : 'Checking record count…')}</p>
      {error && <p className="registry-bulk-delete-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Retry</button></p>}
    </div>
    <button type="button" className="registry-delete-all" disabled={busy || !state || (!isAdmin && !!state.pending) || state.count === 0} onClick={requestDeletion}>{busy ? 'Checking request…' : 'Delete all permit records'}</button>
    {receipt && <dialog ref={notice} className="bulk-delete-notice" aria-labelledby={'bulk-delete-notice-title-'+kind} aria-describedby={'bulk-delete-notice-message-'+kind+' bulk-delete-notice-detail-'+kind} onClose={dismissNotice} onCancel={event => {event.preventDefault(); dismissNotice()}}>
      <span className="bulk-delete-notice-icon" aria-hidden="true">✓</span>
      <h2 id={'bulk-delete-notice-title-'+kind}>{receipt.deleted ? 'Permit records deleted' : receipt.duplicate ? 'Request already awaiting approval' : 'Deletion request sent'}</h2>
      <p id={'bulk-delete-notice-message-'+kind}>{receipt.deleted ? `All ${receipt.count} ${label.toLowerCase()} permit records were permanently deleted with their related records.` : receipt.duplicate ? `A request to delete all ${receipt.count} ${label.toLowerCase()} permit records is already awaiting admin review and confirmation.` : `Your request to delete all ${receipt.count} ${label.toLowerCase()} permit records has been sent to the admin for review and confirmation.`}</p>
      <p id={'bulk-delete-notice-detail-'+kind}>{receipt.deleted ? 'The other permit registry is unaffected.' : 'No records have been deleted. They will remain available until the admin approves the request.'}</p>
      {receipt.id && <p className="bulk-delete-notice-reference">Request #{receipt.id} · Awaiting admin approval</p>}
      <div className="bulk-delete-notice-actions"><button type="button" onClick={dismissNotice}>Okay</button></div>
    </dialog>}
  </div>
}
