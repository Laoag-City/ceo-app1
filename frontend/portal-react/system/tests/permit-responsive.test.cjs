const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../assets/permits/permit-responsive.js'),'utf8');
const frame=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
function trackObservers(w){
 const active=[],Base=w.MutationObserver;
 w.MutationObserver=class extends Base{constructor(callback){super(callback);active.push(this)}};
 return ()=>active.forEach(observer=>observer.disconnect());
}

test('mobile station labels preserve draft date values and existing control events',async()=>{
 const dom=new JSDOM('<div class="matrix-table-wrap"><table><thead><tr><th>Station</th><th>Date Checked</th><th>Status</th></tr></thead><tbody><tr><td colspan="3">Main permit stations</td></tr><tr><td>Sanitary</td><td><input type="date" data-field="date_checked" value="2026-10-01"></td><td><select><option>Pending</option><option>Approved</option></select></td></tr></tbody></table></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,doc=w.document,input=doc.querySelector('input'),select=doc.querySelector('select'),disconnect=trackObservers(w);
 try{
  let changed=0;select.addEventListener('change',()=>changed++);
  input.value='2026-10-02';select.value='Approved';w.eval(code);await frame(w);
  assert.equal(doc.querySelector('input'),input);assert.equal(doc.querySelector('select'),select);
  assert.equal(input.value,'2026-10-02');assert.equal(input.dataset.field,'date_checked');
  assert.equal(input.closest('td').dataset.label,'Date Checked');assert.equal(select.closest('td').dataset.label,'Status');
  assert.equal(doc.querySelector('td[colspan]').hasAttribute('data-label'),false);
  select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(changed,1);
 }finally{disconnect();w.close()}
});

test('mobile labels follow rows replaced by controllers and React review renders',async()=>{
 const dom=new JSDOM('<div class="fr-table"><table><thead><tr><th>Assigned engineer</th><th>Remarks</th></tr></thead><tbody></tbody></table></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,doc=w.document,disconnect=trackObservers(w);
 try{
  w.eval(code);await frame(w);
  doc.querySelector('tbody').innerHTML='<tr><td>Operator</td><td>Submit updated plans.</td></tr>';await frame(w);
  assert.equal(doc.querySelectorAll('td')[1].dataset.label,'Remarks');
  doc.querySelector('thead th').textContent='Reviewing engineer';await frame(w);
  assert.equal(doc.querySelector('td').dataset.label,'Reviewing engineer');
  assert.equal(doc.querySelector('table').getAttribute('role'),'table');
 }finally{disconnect();w.close()}
});
