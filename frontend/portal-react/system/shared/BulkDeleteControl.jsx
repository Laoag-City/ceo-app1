import React, {useCallback, useEffect, useRef, useState} from 'react'

export default function BulkDeleteControl({kind}) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const running = useRef(false), mounted = useRef(true), revision = useRef(0)
  let user; try { user = JSON.parse(sessionStorage.getItem('oboUser') || 'null') } catch {}
  const label = kind === 'permits' ? 'Building' : 'Occupancy', url = '/api/permit-deletions/' + kind
  const headers = {'Content-Type': 'application/json', 'x-user-id': String(user?.id || ''), 'x-permit-request': '1'}
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
    if (user?.role !== 'operator') return
    const reload = () => { if (!running.current) refresh().catch(e => { if (mounted.current) { setState(null); setError(e.message) } }) }
    reload(); window.addEventListener('focus', reload); window.addEventListener('permit-registry-changed', reload)
    return () => { mounted.current = false; window.removeEventListener('focus', reload); window.removeEventListener('permit-registry-changed', reload) }
  }, [refresh, user?.role])
  async function requestDeletion() {
    if (running.current || !state || state.pending || !state.count) return
    running.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const latest = await refresh()
      if (latest.pending || !latest.count) return
      await window.DestructiveAction.run({
        title: 'Request deletion of all ' + label.toLowerCase() + ' permits?',
        message: 'This requests deletion of all ' + latest.count + ' ' + label.toLowerCase() + ' permit records in this registry, including records outside your current search or filter. Records stay available until the admin approves. The other permit registry is unaffected.',
        requireText: 'DELETE ALL', confirmLabel: 'Send request to admin',
        action: async () => {
          const response = await window.RequestFeedback.fetch(url, {method: 'POST', headers, body: JSON.stringify({confirmation: 'DELETE ALL', version: latest.version})})
          const data = await response.json()
          if (!response.ok || !data.success) throw Error(data.message || 'Deletion request could not be submitted.')
          revision.current++; setMessage(data.message); setState({...latest, pending: data.request || {id: data.requestId, record_count: data.count}})
          // A failed status refresh must not turn a committed submission into an
          // apparent failed write. The unique pending request also guards retries.
          refresh().catch(e => { if (mounted.current) setError(e.message) })
        }
      })
    } catch (e) { setError(e.message) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  if (user?.role !== 'operator') return null
  return <div className="registry-bulk-delete">
    <div className="registry-bulk-delete-copy">
      <p>Admin approval required · applies to the entire {label.toLowerCase()} registry</p>
      <p role="status">{message || (state?.pending ? `Deletion request #${state.pending.id} is awaiting admin review (${state.pending.record_count} records).` : state ? `${state.count} permit records` : error ? 'Deletion request status unavailable.' : 'Checking deletion request status…')}</p>
      {error && <p className="registry-bulk-delete-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Retry</button></p>}
    </div>
    <button type="button" className="registry-delete-all" disabled={busy || !state || !!state.pending || state.count === 0} onClick={requestDeletion}>{busy ? 'Checking request…' : 'Delete all permit records'}</button>
  </div>
}
