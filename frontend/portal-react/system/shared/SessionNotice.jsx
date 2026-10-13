import React, {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import css from './session-notice.css?inline'

const replacement = 'Your account was signed in somewhere else, so this session has ended.'
const expired = 'Your session has expired or ended. Inactive accounts are automatically signed out after 30 minutes.'

// An independent overlay leaves the controller-owned page and unsaved drafts intact.
export default function SessionNotice({page}) {
  const queue = page.startsWith('queue-')
  const login = queue ? '/log-in.html' : '/login'
  const isLogin = ['permits-login','permits-admin-login','permits-occupancy_login'].includes(page) || (page==='queue-log-in' && location.pathname!=='/workstations.html')
  const user = useRef((() => {try{return JSON.parse(sessionStorage.getItem(queue?'queueUser':'oboUser') || 'null')}catch{return null}})()).current
  const [message,setMessage] = useState(isLogin && new URLSearchParams(location.search).get('session')==='replaced' ? replacement : '')
  const ended = useRef(!!message), dialog = useRef(null)
  const [warning,setWarning] = useState(false), [remaining,setRemaining] = useState(120)
  const [renewing,setRenewing] = useState(false), [renewError,setRenewError] = useState('')
  const warningDialog=useRef(null), renew=useRef(null), warningOpen=useRef(false)
  const staffPage = !isLogin && (page.startsWith('permits-') || (queue && page!=='queue-monitor' && (page!=='queue-kiosk' || !!user || ['PC1','PC2','PC3'].includes(sessionStorage.getItem('currentWorkspace')))))
  useEffect(() => {
    if(!isLogin || !message)return
    // Consume the redirect receipt so refreshing sign-in cannot replay it.
    const url=new URL(location.href)
    url.searchParams.delete('session')
    history.replaceState(history.state,'',url.pathname+url.search+url.hash)
    sessionStorage.removeItem(queue?'queueUser':'oboUser')
    if(queue)sessionStorage.removeItem('currentWorkspace')
  }, [isLogin,queue])
  useEffect(() => {
    if(!staffPage || typeof window.fetch!=='function')return
    let sessionId=user?.session_id || null, inFlight=false, controller=null, activityPending=false, deadline=null, disposed=false, lastActivitySent=0
    const end = data => {
      if(ended.current)return
      ended.current=true
      warningOpen.current=false;setWarning(false)
      setMessage(data?.code==='SESSION_REPLACED' ? replacement : expired)
      sessionStorage.removeItem(queue?'queueUser':'oboUser')
      if(queue)sessionStorage.removeItem('currentWorkspace')
    }
    // RequestFeedback captures its transport before React mounts. It forwards
    // explicit replacement responses here; raw account requests use the wrapper.
    const handle = data => {if(data?.code==='SESSION_REPLACED')end(data)}
    window.SessionNotice={handle}
    const transport=window.fetch
    const wrapped=async(input,options) => {
      const response=await transport(input,options)
      const url=new URL(typeof input==='string'?input:input.url,location.href)
      if(url.origin===location.origin && url.pathname.startsWith('/api/') && response.status===401 && url.pathname!=='/api/auth/login') {
        try {handle(await response.clone().json())}catch{/* Polling retries if the response cannot be read. */}
      }
      return response
    }
    window.fetch=wrapped
    const check=async(stay=false) => {
      if(ended.current || inFlight || document.hidden)return
      inFlight=true;controller=new AbortController()
      const renewActivity=stay===true || activityPending
      activityPending=false
      if(renewActivity)lastActivitySent=Date.now()
      if(stay===true){setRenewing(true);setRenewError('')}
      const started=Date.now(),timeout=setTimeout(()=>controller.abort(),8000)
      let renewed=false
      try {
        const response=await transport(renewActivity?'/api/auth/activity':'/api/auth/session',{method:renewActivity?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal,
          headers:{...(user?.id?{'x-user-id':String(user.id)}:{}),...(sessionId?{'x-session-id':sessionId}:{}),[queue?'x-queue-request':'x-permit-request']:'1'}})
        const data=await response.json()
        if(disposed)return
        if(response.status===401){end(data);return}
        if(data.sessionChanged){end({code:'SESSION_REPLACED'});return}
        if(!response.ok || !data.success || !data.user)return
        const id=data.user.session_id
        if(sessionId && id && id!==sessionId){end({code:'SESSION_REPLACED'});return}
        if(!sessionId)sessionId=id
        if(queue && !user)sessionStorage.setItem('queueUser',JSON.stringify(data.user))
        if(Number.isFinite(data.user.session_remaining_ms)) {
          deadline=started+data.user.session_remaining_ms
          updateWarning()
          renewed=data.user.session_remaining_ms>120000
          if(renewed)setRenewError('')
        }
      }catch{/* A connection failure is not evidence that a session ended. */}
      finally{
        clearTimeout(timeout);inFlight=false
        if(!disposed && stay===true){setRenewing(false);if(!renewed)setRenewError('Your session could not be extended. Check your connection and try again, or sign in again if you have reached the eight-hour session limit.')}
      }
    }
    const updateWarning=()=>{
      if(deadline===null || ended.current || disposed)return
      const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000))
      warningOpen.current=seconds<=120
      setRemaining(seconds);setWarning(warningOpen.current)
    }
    // Only actual input counts. Polls, socket messages, focus and synthetic
    // browser events never extend a session. Other tabs share the server deadline.
    const activity=event=>{
      if(!event.isTrusted || warningOpen.current || document.hidden)return
      activityPending=true
      if(Date.now()-lastActivitySent>=10000)check()
    }
    const events=['pointerdown','pointermove','keydown','wheel','touchstart']
    for(const event of events)window.addEventListener(event,activity,{passive:true})
    renew.current=()=>check(true)
    const visible=()=>{if(!document.hidden)check()}
    check();const timer=setInterval(check,10000)
    const countdown=setInterval(updateWarning,1000)
    window.addEventListener('focus',check)
    document.addEventListener('visibilitychange',visible)
    return () => {
      disposed=true;clearInterval(timer);clearInterval(countdown);controller?.abort();renew.current=null
      for(const event of events)window.removeEventListener(event,activity)
      window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visible)
      if(window.fetch===wrapped)window.fetch=transport
      if(window.SessionNotice?.handle===handle)delete window.SessionNotice
    }
  }, [staffPage,queue,user])
  useEffect(()=>{
    if(warning && !message){warningDialog.current?.showModal();warningDialog.current?.querySelector('button')?.focus()}
  },[warning,message])
  useEffect(() => {
    if(!message)return
    // A profile/help modal may already be open. Bring the sign-out reason above it.
    for(const open of document.querySelectorAll('dialog[open]'))if(open!==dialog.current)open.close()
    dialog.current.showModal()
  }, [message])
  if(!message && !warning)return null
  return createPortal(<><style>{css}</style>{!message && warning ? <dialog ref={warningDialog} className="session-notice-dialog session-idle-warning" role="alertdialog" aria-modal="true" aria-labelledby="session-idle-title" aria-describedby="session-idle-message" onCancel={event=>event.preventDefault()}>
    <span className="session-notice-icon" aria-hidden="true">!</span>
    <h2 id="session-idle-title">Are you still there?</h2>
    <p id="session-idle-message">For your account’s security, inactive sessions end after 30 minutes. Unsaved changes may be lost when you sign in again.</p>
    <p className="session-notice-detail">{remaining>0?`Session ends in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}.`:'Checking your session…'}</p>
    {renewError && <p role="status" className="session-notice-detail">{renewError}</p>}
    <button type="button" className="session-notice-signin" disabled={renewing} onClick={()=>renew.current?.()}>{renewing?'Checking…':'Stay signed in'}</button>
  </dialog> : <dialog ref={dialog} className="session-notice-dialog" role="alertdialog" aria-modal="true" aria-labelledby="session-notice-title" aria-describedby="session-notice-message" onCancel={event=>event.preventDefault()}>
    <span className="session-notice-icon" aria-hidden="true">!</span>
    <h2 id="session-notice-title">Session ended</h2>
    <p id="session-notice-message">{message}</p>
    <p className="session-notice-detail">Please sign in again to continue.</p>
    <a className="session-notice-signin" href={login}>Go to sign in</a>
  </dialog>}</>, document.body)
}
