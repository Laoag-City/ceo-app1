// Run after the system Vite build; verifies the actual shipped hybrid bundle.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const bundle = fs.readFileSync(path.resolve(__dirname, '../../system-dist/app.js'), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 35));
async function mount(page, mobile = false, role = 'operator') {
  const dom = new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`, {url:'http://localhost/edit?id=1', runScripts:'outside-only'});
  dom.window.matchMedia = () => ({matches:mobile,addEventListener(){},removeEventListener(){}});
  dom.window.ResizeObserver = class {observe(){} disconnect(){}};
  let logouts = 0;
  dom.window.PermitRouting = {logout:async()=>{logouts++}};
  dom.window.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}));
  dom.window.fetch=async()=>({ok:false,json:async()=>({message:'Fixture offline'})});
  dom.window.eval(bundle); await settle();
  return {dom, d:dom.window.document, logouts:()=>logouts};
}
for(const page of ['permits-index','permits-occupancy','permits-edit','permits-occupancy_edit']) {
  test(`${page}: navigation never resets controller-owned DOM`,async()=>{
    const {dom,d,logouts}=await mount(page);
    const expected=page.includes('occupancy')?'/occupancy':'/';
    assert.equal(d.querySelector('.permit-sidebar [aria-current="page"]').getAttribute('href'),expected);
    const input=d.createElement('input');input.value='unsaved operator draft';
    d.querySelector('.page-wrapper').append(input);
    d.querySelector('.permit-nav-heading button').click();await settle();
    assert.equal(d.body.classList.contains('permit-navigation-collapsed'),true);
    assert.equal(input.isConnected,true);assert.equal(input.value,'unsaved operator draft');
    assert.equal(dom.window.localStorage.getItem('permitNavCollapsed'),'true');
    d.querySelector('.permit-nav-logout').click();await settle();assert.equal(logouts(),1);
    dom.window.close();
  });
}
test('mobile drawer closes with Escape and restores focus and scrolling',async()=>{
  const {dom,d}=await mount('permits-occupancy',true);
  const trigger=d.querySelector('.permit-nav-mobile');
  trigger.click();await settle();
  assert.equal(d.querySelector('.permit-sidebar').getAttribute('aria-modal'),'true');
  assert.equal(d.body.style.overflow,'hidden');
  d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(d.activeElement,trigger);assert.equal(d.body.style.overflow,'');
  dom.window.close();
});

for(const role of ['admin','superadmin'])test(role+': dashboard sidebar has reachable role-appropriate sections',async()=>{
 const {dom,d}=await mount('permits-superadmin',false,role);
 try {for(const link of d.querySelectorAll('.permit-sidebar a[href^="#"]'))assert.ok(d.querySelector(link.getAttribute('href')),link.getAttribute('href'));
 assert.equal(!!d.querySelector('.permit-sidebar a[href="#accountListSection"]'),role==='superadmin');
 assert.equal(d.querySelector('.permit-sidebar a[href="/occupancy"]'),null);
 }finally{dom.window.close()}
});
