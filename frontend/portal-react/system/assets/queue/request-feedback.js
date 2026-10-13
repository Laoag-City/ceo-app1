/** MAINTAINER GUIDE
 * Queue transport errors and uncertain-save recovery; do not blindly retry a state-changing request.
 * This is a separately served copy; check the permit counterpart when changing shared behavior.
 */
/* Explicit API transport: no automatic replay of writes. */
(() => {
 let stored=[];try{stored=JSON.parse(sessionStorage.getItem('unconfirmedRequests')||'[]');}catch(_){}
 const pending=new Set(Array.isArray(stored)?stored:[]);
 const persist=()=>{try{sessionStorage.setItem('unconfirmedRequests',JSON.stringify([...pending]));}catch(_){}};
 const nativeFetch=window.fetch.bind(window);
 class RequestError extends Error {constructor(message){super(message);this.name='RequestError';}}
 function verification(url){
  const u=new URL(url,location.href),p=u.pathname;
  if(p.includes('/change-requests/'))return {url:u.origin+(p.startsWith('/api/occupancy')?'/api/occupancy':'/api/permits'),view:'/superadmin',label:'administrator request list'};
  if(p.startsWith('/api/occupancy'))return {url:u.origin+'/api/occupancy',view:'/occupancy.html',label:'occupancy registry and administrator requests'};
  if(p.startsWith('/api/permits')||p.startsWith('/api/matrix'))return {url:u.origin+'/api/permits',view:'/index.html',label:'building registry and administrator requests'};
  if(p.startsWith('/api/auth'))return {url:u.origin+'/api/permits',view:'/superadmin',label:'account directory'};
  if(p.startsWith('/api/videos'))return {url:u.origin+'/api/videos/playlist',view:'/monitor.html',label:'monitor playlist'};
  return {url:u.origin+'/api/logs',view:'/audit-logs.html',label:'queue activity log and current queue'};
 }
 function report(error,context){
  if(error.code==='SESSION_REPLACED' && window.SessionNotice){window.SessionNotice.handle(error);return;}
  if(error.reported)return;error.reported=true;
  let box=document.getElementById('requestFeedback');
  if(!box){box=document.createElement('aside');box.id='requestFeedback';box.className='request-feedback';box.setAttribute('role','alert');document.body.append(box);}
  box.replaceChildren();
  const close=document.createElement('button');close.type='button';close.className='request-feedback-close';close.textContent='×';close.setAttribute('aria-label','Dismiss error');close.onclick=()=>box.remove();
  const message=document.createElement('p');message.textContent=error.message||'The request failed. Please try again.';box.append(close,message);
  if(context){
   const check=document.createElement('button');check.type='button';check.textContent='Check server status';box.append(check);
   check.onclick=async()=>{
    check.disabled=true;
    try{
     const target=verification(context.url);const r=await request(target.url,{headers:context.headers});await r.json();
     const note=document.createElement('p');note.textContent='The server responds now. This does not prove whether the earlier action saved. Review the '+target.label+' in another tab before trying again.';
     const link=document.createElement('a');link.href=target.view;link.target='_blank';link.rel='noopener';link.textContent='Open records to review';
     const allow=document.createElement('button');allow.type='button';allow.textContent='I checked — allow another attempt';
     allow.onclick=()=>{if(!confirm('Have you checked that the earlier action did not save or create a pending request? Another attempt could duplicate it.'))return;pending.delete(context.key);persist();box.remove();};
     check.remove();box.append(note,link,allow);
    }catch(e){report(e);}finally{check.disabled=false;}
   };
  }
 }
 async function request(url,options={}){
  const method=(options.method||'GET').toUpperCase(),write=!['GET','HEAD'].includes(method),u=new URL(url,location.href),key=method+' '+u.href;
  let ticketRetry=false;try{ticketRetry=u.pathname==='/api/tickets'&&!!JSON.parse(options.body||'{}').requestId;}catch(_){}
  const authLogin=u.pathname==='/api/auth/login';
  const context={url:u.href,key,headers:options.headers};
  if(pending.has(key)&&!ticketRetry){const e=new RequestError('The previous action is unconfirmed. Entries are preserved. Check the server and review saved records before another attempt.');report(e,context);throw e;}
  if(navigator.onLine===false){const e=new RequestError('You are offline. Nothing was sent. Reconnect, then submit again; your entries remain in the form.');report(e);throw e;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.body instanceof FormData?120000:20000);
  let response;
  try{
   response=await nativeFetch(url,{...options,credentials:'same-origin',headers:{...options.headers,...(u.origin===location.origin && write?{'x-queue-request':'1'}:{})},signal:controller.signal});
   let data;
   try{data=await response.clone().json();}catch(_){const e=new RequestError('The server returned an unreadable response.');e.definite=response.status>=400&&response.status<500;throw e;}
   if(data===null||typeof data!=='object')throw new RequestError('The server returned an unexpected response.');
   if((!response.ok||data.success===false)&&!data.duplicate){
    const known=response.status<500;
    const message=response.status===401?(authLogin?'Incorrect username or password. Please sign in again.':data.code==='SESSION_REPLACED'?data.message:'Your queue session ended. Return to workstation selection and sign in again.'):response.status===403?'Your account does not have permission for this action.':response.status===413?'The selected file is too large. Choose a smaller file.':response.status===429?'Too many requests. Wait a moment before trying again.':known&&data.message?String(data.message).slice(0,350):'The server could not complete the request.';
    const e=new RequestError(message);e.definite=known;e.conflict=data.conflict===true;
    if(response.status===401 && !authLogin && data.code==='SESSION_REPLACED')e.code=data.code;
    throw e;
   }
   pending.delete(key);persist();return response;
  }catch(error){
   const uncertain=write&&!authLogin&&!error.definite;
   const reason=error.name==='AbortError'?'The server took too long to respond.':error instanceof RequestError?error.message:'Could not reach the server. Check the connection and that the application server is running.';
   const e=new RequestError(reason+(uncertain?' The save outcome is unconfirmed; your entries are preserved.':write?' Your entries are preserved.':' Previously loaded data has been kept.'));
   if(error.code==='SESSION_REPLACED'){e.code=error.code;e.message=reason;}
   if(error.conflict){e.conflict=true;e.message=reason;}
   if(uncertain&&!ticketRetry){pending.add(key);persist();report(e,context);}else{if(uncertain&&ticketRetry)e.message+=' Retry this same form to retrieve the original ticket safely.';report(e);}
   throw e;
  }finally{clearTimeout(timer);}
 }
 window.addEventListener('unhandledrejection',e=>{if(e.reason?.name==='RequestError'){e.preventDefault();report(e.reason);}});
 window.RequestFeedback={fetch:request,report};
})();
