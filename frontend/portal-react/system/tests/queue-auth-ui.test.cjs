const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('node:fs');const path=require('node:path');
const base=path.join(__dirname,'..');
const shell=fs.readFileSync(path.join(base,'features/queue/login.html'),'utf8');
const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const cards'));
const wait=()=>new Promise(r=>setTimeout(r,20));
async function fixture(){
 const dom=new JSDOM('<button id="queueSignOut"></button><form id="loginForm"><input id="workspaceSelect"><input id="queueUsername"><input id="queuePassword"><p id="sessionStatus"></p></form>',{url:'http://localhost:5000/workstations.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const calls=[];
 dom.window.RequestFeedback={fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/workstations/login'))throw Error('Fixture occupied window');return {json:async()=>({success:true})}}};dom.window.eval(controller);return {dom,w:dom.window,calls};
}
test('workstation selection only claims the window and reports ownership errors',async()=>{
 const {dom,w,calls}=await fixture();try{const d=w.document;d.getElementById('workspaceSelect').value='PC1';d.getElementById('loginForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/workstations/login'));assert.equal(JSON.parse(calls[0].options.body).workspace,'PC1');assert.match(d.getElementById('sessionStatus').textContent,/occupied/);}finally{dom.window.close()}
});
test('dedicated login submits credentials, clears passwords, and recovers from failure',async()=>{
 const dom=new JSDOM('<form id="queueSignInForm"><input id="queueUsername"><input id="queuePassword"><button id="queueSignInButton"></button><p id="sessionStatus"></p></form>',{url:'http://localhost:5000/log-in.html',runScripts:'outside-only'});
 try{const w=dom.window;let calls=0;w.RequestFeedback={fetch:async(url,options)=>{calls++;assert.equal(url,'/api/auth/login');assert.equal(JSON.parse(options.body).username,'staff');const error=new Error('Invalid credentials');error.status=401;throw error;}};w.eval(controller);w.document.getElementById('queueUsername').value='staff';w.document.getElementById('queuePassword').value='badpass';w.document.getElementById('queueSignInForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(calls,1);assert.equal(w.document.getElementById('queuePassword').value,'');assert.match(w.document.getElementById('sessionStatus').textContent,/Please sign in again/);assert.equal(w.document.getElementById('queueSignInButton').disabled,false);}finally{dom.window.close()}
});
test('public monitor and kiosk selection never requests staff authentication',async()=>{
 for(const workspace of ['Monitor','Kiosk']){const {dom,w,calls}=await fixture();try{w.document.getElementById('workspaceSelect').value=workspace;w.document.getElementById('loginForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(calls.length,0);assert.equal(w.sessionStorage.getItem('currentWorkspace'),workspace);}finally{dom.window.close()}}
});
test('queue request transport attaches same-origin CSRF header and cookie credentials',async()=>{
 const dom=new JSDOM('',{url:'http://localhost:5000/',runScripts:'outside-only'});try{let sent;dom.window.AbortController=AbortController;dom.window.fetch=async(url,options)=>{sent=options;return new Response(JSON.stringify({success:true}),{status:200})};dom.window.eval(fs.readFileSync(path.join(base,'assets/queue/request-feedback.js'),'utf8'));await dom.window.RequestFeedback.fetch('/api/tickets/hold',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(sent.headers['x-queue-request'],'1');assert.equal(sent.credentials,'same-origin');}finally{dom.window.close()}
});
