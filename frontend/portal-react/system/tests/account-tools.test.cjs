const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=(ms=45)=>new Promise(resolve=>setTimeout(resolve,ms));
async function mount(page='permits-index',custom,setup) {
  const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,calls=[];
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.AbortController=AbortController;w.confirm=()=>true;
  w.sessionStorage.setItem('oboUser',JSON.stringify({id:12,username:'test-operator',role:'operator'}));
  w.fetch=async(url,options)=>{
    calls.push({url,options});
    const data=await custom?.(url,options);
    if(data)return {ok:data.status===200,status:data.status,json:async()=>data.body};
    const body=url==='/api/profile'?{profile:{id:12,username:'test-operator',role:'operator',display_name:'Test Operator',bio:'',avatar_color:'blue'}}:url.startsWith('/api/people')?{people:[{id:12,username:'test-operator',role:'operator',display_name:'Test Operator',bio:'<img src=x onerror=alert(1)>',avatar_color:'green',status:'online'}],hasMore:false}:{success:true};
    return {ok:true,status:200,json:async()=>body};
  };
  setup?.(w);w.eval(bundle);await wait();
  return {dom,w,d,calls,open:async name=>{d.querySelector(`[aria-label="${name}"]`).click();await wait(330)}};
}
function input(w,el,value){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}))}
function submit(w,form){form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}

test('People renders text safely, searches, and leaves the existing workspace draft intact',async()=>{
  const {dom,w,d,calls,open}=await mount();
  try {
    const draft=d.createElement('input');draft.value='unsaved permit';d.querySelector('.page-wrapper').append(draft);
    await open('People');assert.equal(d.querySelector('.account-dialog').open,true);
    assert.match(d.querySelector('.account-people').textContent,/Test Operator/);assert.equal(d.querySelector('.account-people img'),null);
    assert.match(d.querySelector('.account-status').textContent,/Online/);
    input(w,d.querySelector('.account-search input'),'Test 15');await wait(330);
    assert.ok(calls.some(c=>c.url.includes('q=Test%2015')));
    d.querySelector('.account-close').click();await wait();
    assert.equal(d.querySelector('.account-dialog').open,false);assert.equal(draft.value,'unsaved permit');assert.ok(draft.isConnected);
    assert.ok(calls.every(c=>c.options.headers['x-user-id']==='12' && c.options.headers['x-permit-request']==='1'));
  } finally {dom.window.close()}
});

test('Profile saves only editable fields, protects drafts, and validates password confirmation',async()=>{
  const {dom,w,d,calls,open}=await mount();
  try {
    await open('My Profile');
    const profileUpdates=[];w.addEventListener('permit-profile-updated',event=>profileUpdates.push(event.detail));
    const name=d.querySelector('input[autocomplete="nickname"]');input(w,name,'  Updated Name  ');await wait();
    w.confirm=()=>false;d.querySelector('.account-close').click();await wait();assert.equal(d.querySelector('.account-dialog').open,true);
    submit(w,d.querySelector('.account-profile-form'));await wait();
    const saved=calls.find(c=>c.options.method==='PUT');assert.deepEqual(JSON.parse(saved.options.body),{display_name:'Updated Name',bio:'',avatar_color:'blue'});
    assert.match(d.querySelector('.account-profile-form').textContent,/Profile saved/);
    assert.equal(profileUpdates.length,1);assert.equal(profileUpdates[0].userId,12);assert.equal(profileUpdates[0].displayName,'Updated Name');
    const actions=d.querySelector('.account-profile-actions');
    assert.equal(actions.firstElementChild.textContent,'Change Password');
    assert.equal(actions.lastElementChild.textContent,'Save profile');
    assert.equal(d.querySelector('.account-password').hidden,true);
    actions.firstElementChild.click();await wait();
    assert.equal(d.querySelector('.account-password').hidden,false);
    const passwords=d.querySelectorAll('input[type="password"]');
    assert.equal(passwords[1].minLength,6);assert.equal(passwords[2].minLength,6);
    input(w,passwords[0],'old-fixture-password');input(w,passwords[1],'new-fixture-password');input(w,passwords[2],'does-not-match');await wait();
    submit(w,d.querySelector('.account-password form'));await wait();
    assert.match(d.querySelector('.account-password').textContent,/do not match/);
    assert.ok(!calls.some(c=>c.url==='/api/profile/password'));
    input(w,passwords[2],'new-fixture-password');await wait();submit(w,d.querySelector('.account-password form'));await wait();
    assert.match(d.querySelector('.account-dialog-body').textContent,/All previous sessions have ended/);
    assert.equal(w.sessionStorage.getItem('oboUser'),null);assert.equal(d.querySelector('input[type="password"]'),null);
    assert.equal(d.querySelector('.account-dialog-body a').getAttribute('href'),'/login');
  } finally {dom.window.close()}
});

test('People hides only the exact admin username and keeps other admin accounts visible',async()=>{
  const people=[['admin','Hidden account','admin'],['Admin','Capitalized account','admin'],['admin-assistant','Assistant','operator'],['reviewer','Boss','admin'],['engineer','admin','operator']].map(([username,display_name,role],i)=>({id:i+1,username,display_name,role,bio:'',avatar_color:'blue',status:'offline'}));
  const {dom,d,open}=await mount('permits-superadmin',async url=>url.startsWith('/api/people')?{status:200,body:{people,hasMore:false}}:null);
  try{
    await open('People');
    const cards=[...d.querySelectorAll('.account-person')];
    assert.equal(cards.length,4);assert.ok(!cards.some(card=>card.textContent.includes('Hidden account')));
    for(const username of ['Admin','admin-assistant','reviewer','engineer'])assert.ok(cards.some(card=>card.textContent.includes('@'+username)));
  }finally{dom.window.close()}
});

test('Directory errors never show stale online results and retry recovers',async()=>{
  let unavailable=true;
  const {dom,d,open}=await mount('permits-occupancy',async(url)=>url.startsWith('/api/people') && unavailable?{status:503,body:{message:'Could not load people.'}}:null);
  try {
    await open('People');assert.match(d.querySelector('.account-people').textContent,/Could not load/);
    assert.equal(d.querySelector('.account-person'),null);unavailable=false;
    d.querySelector('.account-people button').click();await wait(330);assert.ok(d.querySelector('.account-person'));
  } finally {dom.window.close()}
});

test('Administrator uses sidebar account buttons and expired sessions show a sign-in link',async()=>{
  const {dom,d}=await mount('permits-superadmin',async url=>url==='/api/presence'?{status:401,body:{message:'Please sign in again.'}}:null);
  try {
    assert.equal(d.querySelectorAll('.header-context .account-launchers, .header-context .header-logout').length,0);
    d.querySelector('.permit-sidebar button[aria-label="People"]').click();await wait();
    assert.match(d.querySelector('.account-dialog').textContent,/Please sign in again/);assert.ok(d.querySelector('.account-dialog a[href="/login"]'));
  } finally {dom.window.close()}
});

test('Heartbeat distinguishes activity from idle and stops after session revocation',async()=>{
  let clock=1000000, tick, expired=false;
  const {dom,w,calls}=await mount('permits-index',async url=>url==='/api/presence' && expired?{status:401,body:{message:'Please sign in again.'}}:null,w=>{
    w.Date.now=()=>clock;w.document.hasFocus=()=>true;
    const original=w.setInterval.bind(w);
    w.setInterval=(callback,ms)=>{if(ms===30000){tick=callback;return 99}return original(callback,ms)};
  });
  try {
    const beats=()=>calls.filter(c=>c.url==='/api/presence');
    assert.equal(JSON.parse(beats().at(-1).options.body).active,true);
    clock+=6*60*1000;await tick();assert.equal(JSON.parse(beats().at(-1).options.body).active,false);
    w.dispatchEvent(new w.Event('pointerdown'));await tick();assert.equal(JSON.parse(beats().at(-1).options.body).active,true);
    expired=true;await tick();const count=beats().length;await tick();assert.equal(beats().length,count);
  } finally {dom.window.close()}
});

test('Mobile drawer hands focus to dialog and restores page scrolling when closed',async()=>{
  const {dom,d,open}=await mount('permits-occupancy',null,w=>{w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})});
  try {
    d.querySelector('.permit-nav-mobile').click();await wait();assert.equal(d.body.style.overflow,'hidden');
    await open('People');assert.equal(d.querySelector('.permit-sidebar').classList.contains('is-open'),false);
    assert.equal(d.querySelector('.account-dialog').open,true);assert.equal(d.body.style.overflow,'hidden');
    d.querySelector('.account-close').click();await wait();assert.equal(d.body.style.overflow,'');
  } finally {dom.window.close()}
});
