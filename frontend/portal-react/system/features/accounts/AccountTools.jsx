import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

// Isolated React panels: updates here must never rerender a controller-owned Page.
const COLORS = ['blue', 'green', 'purple', 'rose', 'amber', 'slate']
const roleName = role => ({operator:'Operator', admin:'Administrator', superadmin:'Super administrator'}[role] || 'Account')
function Avatar({person}) {
  const initials = (person.display_name || person.username || '?').trim().split(/\s+/).slice(0,2).map(word => Array.from(word)[0]).join('').toUpperCase()
  return <span className={`account-avatar color-${COLORS.includes(person.avatar_color) ? person.avatar_color : 'blue'}`} aria-hidden="true">{initials}</span>
}

function People({api}) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [reload, setReload] = useState(0)
  const [result, setResult] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    const interval = setInterval(() => {if (!document.hidden) setReload(n=>n+1)}, 30000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setResult(null); setError('')
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/people?q=${encodeURIComponent(query)}&page=${page}`, {signal:controller.signal})
        if (!controller.signal.aborted) setResult(data)
      } catch (err) {if (!controller.signal.aborted) setError(err.message)}
    }, 250)
    return () => {clearTimeout(timer); controller.abort()}
  }, [query, page, reload, api])
  const people = result?.people.filter(person => person.username !== 'admin') || []
  return <>
    <p className="account-help">Your team across permit services. Status updates about every 30 seconds.</p>
    <label className="account-search">Find a person<input type="search" placeholder="Search name or username" maxLength={80} value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} /></label>
    <div className="account-status-key"><span>● Online</span><span>◐ Away</span><span>○ Offline</span></div>
    <div className="account-people" aria-live="polite" aria-busy={!result && !error}>
      {error ? <div className="account-notice is-error" role="alert">{error} <button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></div> : !result ? <p className="account-empty">Loading people…</p> : people.length === 0 ? <p className="account-empty">No people found.</p> : people.map(person => <article className="account-person" key={person.id}>
        <Avatar person={person}/><div className="account-person-copy"><strong>{person.display_name}</strong><span>@{person.username} · {roleName(person.role)}</span>{person.bio && <p>{person.bio}</p>}</div>
        <span className={`account-status is-${person.status}`}><i aria-hidden="true"/>{person.status === 'online' ? 'Online' : person.status === 'away' ? 'Away' : 'Offline'}</span>
      </article>)}
    </div>
    <div className="account-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!result?.hasMore} onClick={()=>setPage(n=>n+1)}>Next</button></div>
    <p className="account-help account-footnote">Away means no recent activity. Offline can also mean the page or connection is closed.</p>
  </>
}

function Profile({api, dirty, busy, onPasswordChanged}) {
  const [profile, setProfile] = useState(null), [saved, setSaved] = useState(null), [loadError, setLoadError] = useState(''), [reload, setReload] = useState(0)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwords, setPasswords] = useState({current:'', next:'', confirm:''}), [passwordError, setPasswordError] = useState(''), [changing, setChanging] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); setLoadError('')
    api('/profile', {signal:controller.signal}).then(data=>{if(!controller.signal.aborted){setProfile(data.profile);setSaved(data.profile)}}).catch(err=>{if(!controller.signal.aborted)setLoadError(err.message)})
    return () => controller.abort()
  }, [api, reload])
  useEffect(() => {
    dirty.current = (profile && saved && JSON.stringify(profile)!==JSON.stringify(saved)) || Object.values(passwords).some(Boolean)
    return () => {dirty.current=false}
  }, [profile, saved, passwords, dirty])
  if(loadError) return <p className="account-notice is-error" role="alert">{loadError} <button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></p>
  if(!profile) return <p className="account-empty">Loading your profile…</p>
  const update = (key,value) => {setProfile(p=>({...p,[key]:value}));setMessage('');setError('')}
  async function save(event) {
    event.preventDefault(); if(busy.current)return
    if(!profile.display_name.trim()) {setError('Enter a display name.');return}
    busy.current=true;setSaving(true);setError('');setMessage('')
    try {
      const values = {display_name:profile.display_name.trim(), bio:profile.bio.trim(), avatar_color:profile.avatar_color}
      await api('/profile', {method:'PUT', body:JSON.stringify(values)})
      const clean = {...profile, ...values};setProfile(clean);setSaved(clean);setMessage('Profile saved.')
      window.dispatchEvent(new CustomEvent('permit-profile-updated', {detail:{userId:profile.id,displayName:values.display_name}}))
    } catch(err) {setError(err.message)} finally {busy.current=false;setSaving(false)}
  }
  async function changePassword(event) {
    event.preventDefault();if(busy.current)return
    setPasswordError('')
    if(passwords.next!==passwords.confirm) {setPasswordError('The new passwords do not match.');return}
    if(passwords.next===passwords.current) {setPasswordError('Choose a different password.');return}
    busy.current=true;setChanging(true)
    try {
      await api('/profile/password', {method:'POST', body:JSON.stringify({current_password:passwords.current,new_password:passwords.next})})
      setPasswords({current:'',next:'',confirm:''});dirty.current=false;onPasswordChanged()
    } catch(err) {setPasswordError(err.message)} finally {busy.current=false;setChanging(false)}
  }
  return <>
    <form onSubmit={save} className="account-profile-form">
      <fieldset disabled={saving || changing}>
        <div className="account-profile-heading"><Avatar person={profile}/><div><strong>{profile.display_name || profile.username}</strong><span>@{profile.username} · {roleName(profile.role)}</span></div></div>
        <p className="account-help">Your display name appears in People and as Assigned Engineer for your station. Your login username and existing logs stay the same.</p>
        <label>Display name<input autoComplete="nickname" maxLength={80} required value={profile.display_name} onChange={e=>update('display_name',e.target.value)}/></label>
        <fieldset className="account-colors"><legend>Avatar color</legend>{COLORS.map(color=><label key={color} className={`color-${color}`} title={color}><input type="radio" name="avatar-color" aria-label={`${color} avatar`} value={color} checked={profile.avatar_color===color} onChange={()=>update('avatar_color',color)}/><span aria-hidden="true">{profile.avatar_color===color ? '✓' : ''}</span></label>)}</fieldset>
        <label>About you <span className="account-optional">Optional</span><textarea maxLength={300} rows={3} placeholder="A short introduction for your team" value={profile.bio} onChange={e=>update('bio',e.target.value)}/></label>
        {error && <p className="account-notice is-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
        <div className="account-form-actions account-profile-actions"><button type="button" aria-expanded={showPassword} aria-controls="account-password-panel" onClick={()=>setShowPassword(open=>!open)}>Change Password</button><button className="account-primary" type="submit">{saving ? 'Saving…' : 'Save profile'}</button></div>
      </fieldset>
    </form>
    <section id="account-password-panel" className="account-password" hidden={!showPassword} aria-label="Change password"><p className="account-help">Use at least 6 characters. Changing your password signs you out on every device.</p>
      <form onSubmit={changePassword}><fieldset disabled={saving || changing}>
        <input type="text" autoComplete="username" value={profile.username} readOnly hidden/>
        {[["current","Current password","current-password"],["next","New password","new-password"],["confirm","Confirm new password","new-password"]].map(([key,label,complete])=><label key={key}>{label}<input type="password" autoComplete={complete} required minLength={key==='current'?undefined:6} maxLength={72} value={passwords[key]} onChange={e=>setPasswords(p=>({...p,[key]:e.target.value}))}/></label>)}
        {passwordError && <p role="alert" className="account-notice is-error">{passwordError}</p>}
        <div className="account-form-actions"><button type="submit" className="account-primary">{changing ? 'Changing…' : 'Change password'}</button></div>
      </fieldset></form>
    </section>
  </>
}

export default function AccountTools() {
  const [view,setView] = useState(null), [launcher,setLauncher] = useState(null), [ended,setEnded] = useState('')
  const dialog = useRef(null), dirty = useRef(false), busy = useRef(false), stopped = useRef(false), opener = useRef(null)
  // The server seeds this hint before mount; it only detects another tab changing accounts.
  // Authentication always comes from the HttpOnly cookie, never from this storage value.
  const identity = useRef((() => {try{return JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.id}catch{return null}})())
  const api = useRef(async (path,options={}) => {
    const response = await window.fetch('/api'+path, {...options,cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','x-permit-request':'1',...(identity.current?{'x-user-id':String(identity.current)}:{}),...options.headers}})
    let data;try{data=await response.json()}catch{throw new Error('The account service is unavailable. Please try again.')}
    if(!response.ok) {
      if(response.status===401 || data.sessionChanged){stopped.current=true;setEnded(data.message || 'Please sign in again.')}
      throw new Error(data.message || 'Could not complete this request. Please try again.')
    }
    return data
  }).current
  useEffect(() => {
    setLauncher(document.getElementById('account-tools-launcher'))
    const open = event => {if(['people','profile'].includes(event.detail)){opener.current=document.activeElement;setView(event.detail)}}
    window.addEventListener('permit-account-panel',open)
    return () => window.removeEventListener('permit-account-panel',open)
  }, [])
  useEffect(() => {
    if(!view)return
    if(!dialog.current.open) dialog.current.showModal()
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    return ()=>{document.body.style.overflow=previous}
  }, [view])
  useEffect(() => {
    if(typeof window.fetch!=='function')return
    let lastInput=Date.now(), inFlight=false, controller=null
    const activity=()=>{lastInput=Date.now()}
    const beat=async()=>{
      if(stopped.current || inFlight)return
      inFlight=true;controller=new AbortController()
      // Only acknowledge actual recent activity; idle heartbeats must not extend it.
      try{await api('/presence',{method:'POST',body:JSON.stringify({active:!document.hidden && document.hasFocus() && Date.now()-lastInput<31000}),signal:controller.signal})}catch{/* Offline is inferred server-side; the next interval retries network errors. */}finally{inFlight=false}
    }
    const visibility=()=>{if(!document.hidden)activity();beat()}
    for(const type of ['pointerdown','keydown','scroll','focus'])window.addEventListener(type,activity,true)
    document.addEventListener('visibilitychange',visibility)
    beat();const timer=setInterval(beat,30000)
    return ()=>{clearInterval(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);for(const type of ['pointerdown','keydown','scroll','focus'])window.removeEventListener(type,activity,true)}
  }, [api])
  function close(event) {
    event?.preventDefault()
    if(busy.current)return
    if(dirty.current && !ended && !window.confirm('Discard your unsaved profile changes?'))return
    dialog.current.close();setView(null);dirty.current=false;opener.current?.focus()
  }
  function launch(panel,event) {opener.current=event.currentTarget;setView(panel)}
  return <>
    {launcher && createPortal(<div className="account-launchers"><button type="button" onClick={e=>launch('people',e)}>People</button><button type="button" onClick={e=>launch('profile',e)}>My Profile</button></div>,launcher)}
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-panel-title" onCancel={close}>
      <div className="account-dialog-heading"><div><span>PERMIT SERVICES</span><h2 id="account-panel-title">{view==='people' ? 'People' : 'My Profile'}</h2></div><button type="button" className="account-close" aria-label="Close account panel" onClick={close}>×</button></div>
      <div className="account-dialog-body">
        {ended ? <div className="account-notice" role="status"><p>{ended}</p><a href="/login">Sign in again</a></div> : view==='people' ? <People api={api}/> : view==='profile' ? <Profile api={api} dirty={dirty} busy={busy} onPasswordChanged={()=>{stopped.current=true;sessionStorage.removeItem('oboUser');setEnded('Password changed. Please sign in again. All previous sessions have ended.')}}/> : null}
      </div>
    </dialog>
  </>
}
