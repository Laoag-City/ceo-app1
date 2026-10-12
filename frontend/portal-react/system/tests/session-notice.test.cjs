const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,45));
// React effects may flush after a fixed timer under a concurrent full-suite run.
async function noticeOpened(document) {
 const deadline=Date.now()+2000;
 while(!document.querySelector('.session-notice-dialog')?.open && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(document.querySelector('.session-notice-dialog')?.open,true,'Session notice must open');
}
async function fixture(page,url,handler,feedback=false) {
 const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,calls=[];let interval;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.AbortController=AbortController;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const user={id:12,username:'test-staff',role:'operator',session_id:'original-session'};
 w.sessionStorage.setItem(page.startsWith('queue-')?'queueUser':'oboUser',JSON.stringify(user));
 w.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url==='/api/auth/session' || url==='/api/replaced-operation')return handler(url);
  return new Response(JSON.stringify({success:true}),{status:200});
 };
 const realInterval=w.setInterval.bind(w);w.setInterval=(callback,ms)=>{if(ms===10000){interval=callback;return 999999}return realInterval(callback,ms)};
 if(feedback)w.eval(fs.readFileSync(path.resolve(__dirname,'../assets',page.startsWith('queue-')?'queue':'permits','request-feedback.js'),'utf8'));
 w.eval(bundle);await wait();
 return {dom,w,d,calls,check:async()=>{await interval?.();await wait()}};
}
const valid=(id='original-session')=>new Response(JSON.stringify({success:true,user:{id:12,role:'operator',session_id:id}}));
const replaced=()=>new Response(JSON.stringify({success:false,code:'SESSION_REPLACED',message:'Your account was signed in somewhere else.'}),{status:401});

for(const [page,url] of [
 ['permits-index','http://localhost:3000/'],['permits-occupancy_edit','http://localhost:3000/occupancy_edit.html'],
 ['permits-superadmin','http://localhost:3000/admin'],['queue-log-in','http://localhost:5000/workstations.html'],
 ['queue-kiosk','http://localhost:5000/kiosk.html'],['queue-client-history','http://localhost:5000/client-history.html']
])test(`${page} notifies an idle displaced session without discarding drafts or logging out its replacement`,async()=>{
 let ended=false;const f=await fixture(page,url,()=>ended?replaced():valid());
 try {
  const draft=f.d.createElement('input');draft.value='unsaved entry';f.d.body.append(draft);
  const help=f.d.createElement('dialog');f.d.body.append(help);help.showModal();
  ended=true;await f.check();await noticeOpened(f.d);
  const notice=f.d.querySelector('.session-notice-dialog');assert.equal(notice.open,true);
  assert.match(notice.textContent,/signed in somewhere else/);assert.equal(help.open,false);
  assert.equal(draft.value,'unsaved entry');assert.equal(draft.isConnected,true);
  assert.equal(notice.querySelector('a').getAttribute('href'),page.startsWith('queue-')?'/log-in.html':'/login');
  assert.equal(f.w.sessionStorage.getItem(page.startsWith('queue-')?'queueUser':'oboUser'),null);
  const count=f.calls.filter(c=>c.url==='/api/auth/session').length;await f.check();
  assert.equal(f.calls.filter(c=>c.url==='/api/auth/session').length,count);
  assert.equal(f.calls.some(c=>c.url==='/api/auth/logout'),false);
  const cancel=new f.w.Event('cancel',{cancelable:true});notice.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
 } finally {f.dom.window.close()}
});

test('another tab replacing the browser cookie also ends the original page session',async()=>{
 let changed=false;const f=await fixture('permits-index','http://localhost:3000/',()=>valid(changed?'new-session':'original-session'));
 try{changed=true;await f.check();assert.match(f.d.querySelector('.session-notice-dialog').textContent,/signed in somewhere else/)}finally{f.dom.window.close()}
});

test('offline and unavailable checks are retried without a false sign-out',async()=>{
 let state='offline';const f=await fixture('queue-log-in','http://localhost:5000/workstations.html',()=>{
  if(state==='offline')throw Error('Offline');if(state==='unavailable')return new Response('{}',{status:503});return valid();
 });
 try{state='unavailable';await f.check();state='valid';await f.check();assert.equal(f.d.querySelector('.session-notice-dialog'),null);assert.ok(f.w.sessionStorage.getItem('queueUser'))}finally{f.dom.window.close()}
});

test('ordinary expiration uses a distinct explanation',async()=>{
 const f=await fixture('permits-index','http://localhost:3000/',()=>new Response(JSON.stringify({success:false}),{status:401}));
 try{assert.match(f.d.querySelector('.session-notice-dialog').textContent,/expired or ended/);assert.doesNotMatch(f.d.querySelector('.session-notice-dialog').textContent,/somewhere else/)}finally{f.dom.window.close()}
});

test('public monitor and ordinary sign-in pages do not poll authentication',async()=>{
 for(const [page,url] of [['queue-monitor','http://localhost:5000/monitor.html'],['permits-login','http://localhost:3000/login'],['queue-log-in','http://localhost:5000/log-in.html']]) {
  const f=await fixture(page,url,()=>{assert.fail('Public page must not poll staff identity')});
  try{assert.equal(f.calls.some(c=>c.url==='/api/auth/session'),false);assert.equal(f.d.querySelector('.session-notice-dialog'),null)}finally{f.dom.window.close()}
 }
});

test('refreshing a revoked protected page preserves its replacement explanation on sign-in',async()=>{
 for(const [page,url] of [['permits-login','http://localhost:3000/login?session=replaced'],['queue-log-in','http://localhost:5000/log-in.html?session=replaced']]) {
  const f=await fixture(page,url,()=>valid());
  try{
   await noticeOpened(f.d);
   assert.match(f.d.querySelector('.session-notice-dialog').textContent,/signed in somewhere else/);
   assert.equal(new URL(f.w.location.href).searchParams.has('session'),false,'A refresh must not replay the notice');
   assert.equal(f.w.sessionStorage.getItem(page.startsWith('queue-')?'queueUser':'oboUser'),null);
   const refreshed=await fixture(page,f.w.location.href,()=>valid());
   try{assert.equal(refreshed.d.querySelector('.session-notice-dialog'),null);}finally{refreshed.dom.window.close();}
  }finally{f.dom.window.close()}
 }
});

for(const [page,url] of [['permits-index','http://localhost:3000/'],['queue-log-in','http://localhost:5000/workstations.html']])
test(`${page} request feedback opens the replacement popup immediately without marking a rejected write uncertain`,async()=>{
 const f=await fixture(page,url,url=>url==='/api/auth/session'?valid():replaced(),true);
 try {
  await assert.rejects(f.w.RequestFeedback.fetch('/api/replaced-operation',{method:'POST'}),error=>error.code==='SESSION_REPLACED');await wait();
  assert.equal(f.d.querySelector('.session-notice-dialog').open,true);
  assert.equal(f.d.getElementById('requestFeedback'),null);
  assert.deepEqual(JSON.parse(f.w.sessionStorage.getItem('unconfirmedRequests') || '[]'),[]);
 }finally{f.dom.window.close()}
});
