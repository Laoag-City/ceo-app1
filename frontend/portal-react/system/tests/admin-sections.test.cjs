const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,40));
async function until(check){for(let i=0;i<100;i++){if(check())return;await wait()}assert.fail('Admin view did not update');}
async function mount(hash='',role='admin'){
 const dom=new JSDOM('<div id="system-react-root" data-page="permits-superadmin"></div>',{url:'http://localhost/'+(role==='admin'?'admin':'superadmin')+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.scrollTo=()=>{};w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}));
 w.fetch=async url=>({ok:true,json:async()=>url==='/api/admin/overview'?{totals:role==='admin'?{building:3,occupancy:2,buildingPending:1,occupancyPending:1,buildingDeletions:0,occupancyDeletions:0}:{accounts:3,pendingAccounts:1},recent:[]}:url==='/api/final-reviews'?{success:true,projects:[]}:{success:true,profile:{display_name:'Admin'},user:{id:1,role}}});
 w.eval(bundle);await until(()=>d.querySelector('.ao-stats'));return {dom,w,d};
}
const visible=v=>[...v.d.querySelectorAll('[data-admin-console-panel]')].filter(node=>v.w.getComputedStyle(node).display!=='none');
test('Overview shows only overview content and shortcuts open the selected request workspace',async()=>{
 const v=await mount();try{
  assert.equal(visible(v).length,1);assert.equal(visible(v)[0],v.d.querySelector('.admin-overview'));assert.equal(v.d.querySelector('.console-grid').hidden,true);assert.equal(v.d.querySelector('.topbar h1').textContent,'Admin Overview');
  v.d.querySelector('.ao-queue').click();await until(()=>v.d.querySelector('.container').dataset.adminConsoleView==='buildingReview');assert.equal(visible(v).length,1);assert.equal(visible(v)[0].id,'buildingReview');assert.equal(v.d.querySelector('.console-grid').hidden,false);assert.equal(v.d.getElementById('occupancyReview').hidden,true);assert.equal(v.d.getElementById('finalReviews').hidden,true);assert.equal(v.d.querySelector('.topbar h1').textContent,'Building Requests');
 }finally{v.dom.window.close()}
});
test('saved subsection URLs open only their selected content at full width',async()=>{
 for(const [id,title] of [['finalReviews','Final Project Review'],['buildingReview','Building Requests'],['occupancyReview','Occupancy Requests']]){
  const v=await mount('#'+id);try{assert.equal(visible(v).length,1);assert.equal(visible(v)[0].id,id);assert.equal(v.d.querySelector('.topbar h1').textContent,title);assert.match(v.d.title,new RegExp(title));assert.equal(v.d.querySelector('.permit-sidebar [aria-current=page]').getAttribute('href'),'#'+id);assert.equal(v.w.getComputedStyle(v.d.querySelector('.console-grid')).gridTemplateColumns,'minmax(0,1fr)')}finally{v.dom.window.close()}
 }
});
test('switching sections and browser Back retain controller-owned content and event handlers',async()=>{
 const v=await mount();try{
  const button=v.d.createElement('button');button.textContent='Existing request action';let clicks=0;button.addEventListener('click',()=>clicks++);v.d.getElementById('permitApprovals').append(button);
  v.w.location.hash='buildingReview';await until(()=>!v.d.getElementById('buildingReview').hidden);button.click();
  v.w.location.hash='occupancyReview';await until(()=>!v.d.getElementById('occupancyReview').hidden);assert.equal(v.d.getElementById('buildingReview').hidden,true);assert.equal(button.isConnected,true);
  v.w.history.back();await until(()=>v.w.location.hash==='#buildingReview'&&!v.d.getElementById('buildingReview').hidden);assert.equal(v.d.getElementById('permitApprovals').firstChild,button);button.click();assert.equal(clicks,2);
  v.w.location.hash='adminOverview';await until(()=>!v.d.querySelector('.admin-overview').hidden);assert.equal(visible(v).length,1);assert.equal(v.d.querySelector('.topbar h1').textContent,'Admin Overview');
 }finally{v.dom.window.close()}
});
test('final review filters survive switching to another subsection',async()=>{
 const v=await mount('#finalReviews');try{
  const input=v.d.querySelector('.fr-filters input'),set=Object.getOwnPropertyDescriptor(v.w.HTMLInputElement.prototype,'value').set;set.call(input,'Retained project search');input.dispatchEvent(new v.w.Event('input',{bubbles:true}));await wait();
  v.w.location.hash='buildingReview';await until(()=>!v.d.getElementById('buildingReview').hidden);v.w.location.hash='finalReviews';await until(()=>!v.d.getElementById('finalReviews').hidden);assert.equal(v.d.querySelector('.fr-filters input'),input);assert.equal(input.value,'Retained project search');
 }finally{v.dom.window.close()}
});
test('unknown bookmarks fall back to Overview and IT keeps its existing account screen',async()=>{
 let v=await mount('#unknown');try{assert.equal(visible(v).length,1);assert.equal(visible(v)[0],v.d.querySelector('.admin-overview'))}finally{v.dom.window.close()}
 v=await mount('','superadmin');try{assert.equal(v.d.querySelector('[data-admin-console-view]'),null);assert.equal(v.d.querySelector('.topbar h1').textContent,'User Account Management');assert.equal(v.d.querySelector('.admin-overview').hidden,false);assert.equal(v.d.querySelector('.console-grid').hidden,false);assert.ok(v.d.getElementById('accountListSection'))}finally{v.dom.window.close()}
});
