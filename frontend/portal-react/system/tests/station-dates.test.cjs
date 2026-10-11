const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
function fixture(kind='permits'){
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('[autofocus]')?.focus()};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/permits/station-dates.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../assets/permits/remarks-viewer.js'),'utf8'));
 w.document.body.innerHTML='<style>'+fs.readFileSync(path.join(__dirname,'../assets/permits/station-dates.css'),'utf8')+'</style><div class="matrix-table-wrap"><table><tbody id="matrixTableBody"><tr><td><select><option>Pending</option><option>Approved</option><option>Rejected</option></select></td>'+w.StationDates.cells(kind,52,{id:2,date_checked:'2026-01-01',date_approved:'2026-01-03'},true)+'</tr></tbody></table></div>';
 return {dom,w,row:w.document.querySelector('tr')};
}
test('progress and view-mode dates are read-only, escaped and calendar-only',()=>{
 const {dom,w}=fixture();try{
 const summary=w.StationDates.summary({date_checked:'2026-09-20T00:00:00Z',date_approved:'<img src=x>'});
 assert.match(summary,/Date Checked: 2026-09-20/);assert.match(summary,/Date Approved: —/);assert.ok(!summary.includes('<button'));assert.ok(!summary.includes('<img'));
 for(const kind of ['permits','occupancy']){const view=w.StationDates.cells(kind,52,{id:2,date_checked:'2026-09-20'});assert.ok(!view.includes('<input'));assert.match(view,/2026-09-20/);}
 }finally{dom.window.close()}
});
for(const kind of ['permits','occupancy'])for(const field of ['date_checked','date_approved'])test(kind+': '+field+' is a local draft and preserves the other date',()=>{
 const {dom,w,row}=fixture(kind);try{
 w.RequestFeedback={fetch(){assert.fail('Changing a date must not submit an approval request')}};
 const control=row.querySelector('[data-field="'+field+'"]');control.value='2026-01-02';control.dispatchEvent(new w.Event('input',{bubbles:true}));control.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(w.document.querySelector('dialog'),null);assert.equal(row.querySelectorAll('input[type=date]').length,2);
 const values=w.StationDates.read(row);assert.equal(values[field],'2026-01-02');assert.equal(values[field==='date_checked'?'date_approved':'date_checked'],field==='date_checked'?'2026-01-03':'2026-01-01');
 }finally{dom.window.close()}
});
test('date drafts reject reversed, missing checked and future dates, then recover',()=>{
 const {dom,w,row}=fixture();try{
 const checked=row.querySelector('[data-field=date_checked]'),approved=row.querySelector('[data-field=date_approved]');
 checked.value='2026-01-04';assert.equal(w.StationDates.read(row),null);assert.match(approved.validationMessage,/cannot be earlier/);
 checked.value='';assert.equal(w.StationDates.read(row),null);
 checked.value='2999-01-01';approved.value='';assert.equal(w.StationDates.read(row),null);
 checked.value='2026-01-01';approved.value='2026-01-02';assert.equal(w.StationDates.read(row).date_approved,'2026-01-02');
 checked.value=approved.value='';assert.equal(w.StationDates.read(row).date_checked,'');
 }finally{dom.window.close()}
});
test('status and date controls have minimum widths to keep their values visible',()=>{
 const {dom,w,row}=fixture();try{
 const status=row.querySelector('select'),date=row.querySelector('input');
 assert.equal(w.getComputedStyle(status).minWidth,'132px');assert.equal(w.getComputedStyle(date).minWidth,'148px');
 assert.equal(w.getComputedStyle(status).minHeight,'42px');assert.equal(w.getComputedStyle(row.closest('table')).minWidth,'1120px');
 for(const value of ['Pending','Approved','Rejected']){status.value=value;status.dispatchEvent(new w.Event('change'));assert.equal(status.selectedOptions[0].textContent,value);}
 }finally{dom.window.close()}
});

for(const kind of ['permits','occupancy'])test(kind+': progress opens matching saved station remarks in a safe read-only popup',async()=>{
 const {dom,w}=fixture(kind);try{
  const host=w.document.createElement('section');host.id='progressContent';
  host.innerHTML='<div data-progress-station="50"></div><div data-progress-station="51"></div><div data-progress-station="52"></div>';w.document.body.append(host);
  const main="Check owner's signature\n<img src=x onerror=alert(1)>",other='Provide revised plans';
  const calls=[],row=(id,feedback_remarks,status='Pending')=>({id,discipline_name:'Electrical',feedback_remarks,signature_status:status});
  w.RequestFeedback={fetch:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({id:10,matrix:[row(50,main),row(51,' \n ')],sub_permits:kind==='permits'?[{matrix:[row(52,other,'Rejected')]}]:[],...(kind==='occupancy'?{matrix:[row(50,main),row(51,' \n '),row(52,other,'Approved')]}:{})})}}};
  await w.StationDates.loadRemarks(host,kind,10);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/'+kind+'/10');assert.equal(calls[0].length,1,'Reading remarks never submits a write.');
  assert.equal(host.querySelectorAll('[data-station-remarks]').length,2);assert.ok(!host.querySelector('[data-progress-station="51"] button'));
  const button=host.querySelector('[data-progress-station="50"] button');
  assert.equal(button.textContent,'See remarks');assert.ok(!host.textContent.includes(main));button.click();
  const popup=w.document.getElementById('stationRemarksDialog');assert.equal(popup.open,true);
  assert.equal(popup.querySelector('h2').textContent,'Electrical');assert.equal(popup.querySelector('#stationRemarksText').textContent,main);assert.ok(!popup.querySelector('img,textarea,input'));
  popup.querySelector('.remarks-viewer-done').click();assert.equal(popup.open,false);assert.equal(w.document.activeElement,button);
  host.querySelector('[data-progress-station="52"] button').click();assert.equal(popup.querySelector('#stationRemarksText').textContent,other);assert.equal(w.document.querySelectorAll('#stationRemarksDialog').length,1);
  assert.equal(calls.length,1,'Opening saved remarks does not reload or submit them.');assert.ok(!host.querySelector('.station-remarks-notice'));
 }finally{dom.window.close()}
});

test('progress remark responses cannot overwrite a newer project and failures offer retry',async()=>{
 const {dom,w}=fixture();try{
  const host=w.document.createElement('section');host.innerHTML='<div data-progress-station="50"></div>';w.document.body.append(host);
  let release;
  w.RequestFeedback={fetch:url=>url.endsWith('/10')?new Promise(resolve=>{release=resolve}):Promise.resolve({ok:true,json:async()=>({id:20,matrix:[{id:50,feedback_remarks:'Current project'}]})})};
  const old=w.StationDates.loadRemarks(host,'permits',10);await w.StationDates.loadRemarks(host,'permits',20);
  release({ok:true,json:async()=>({id:10,matrix:[{id:50,feedback_remarks:'Wrong project'}]})});await old;
  assert.equal(host.querySelector('[data-station-remarks]').dataset.remarksText,'Current project');assert.equal(host.querySelectorAll('[data-station-remarks]').length,1);
  w.RequestFeedback={fetch:async()=>{throw Error('Offline')}};await w.StationDates.loadRemarks(host,'permits',20);
  assert.ok(!host.querySelector('[data-station-remarks]'));assert.match(host.querySelector('[role="status"]').textContent,/could not be loaded.*Reopen progress/);
 }finally{dom.window.close()}
});
