const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
async function fixture(kind,datesSupported=true,role='operator'){
 const occupancy=kind==='occupancy',calls=[],alerts=[];
 const dom=new JSDOM('<div id="system-react-root" data-page="'+(occupancy?'permits-occupancy_edit':'permits-edit')+'"></div>',{url:'http://localhost/'+(occupancy?'occupancy_edit':'edit')+'?id=10',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;let fail=false;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.AbortController=AbortController;w.alert=message=>alerts.push(message);w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('[autofocus]')?.focus()};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,username:'fixture',role}));
 const station={id:50,can_edit:true,assigned_operator_id:1,engineer_profile_bound:true,discipline_name:'Electrical',engineer_name:'Original',signature_status:'Pending',feedback_remarks:'',date_checked:'2026-01-01',date_approved:''};
 const record={id:10,project_title:'Fixture',location:'Location',owner_name:'Owner',permit_date:'2026-01-01',date_applied:'2026-01-01',lot_numbers:[],sub_permits:occupancy?[]:[{id:7,sub_project_title:'Annex',matrix:[{...station,id:51}]}],rejection_history:'[]',_version:'loaded-permit',_signatureDatesSupported:datesSupported,_stationAccessSupported:true,_assignedEngineerProfileSupported:true,matrix:[station]};
 w.fetch=async(url,options={})=>{
  calls.push({url,options});
  if(options.method==='PUT')return new Response(JSON.stringify(fail?{success:false,message:'Save failed; please retry.'}:{success:true,pending:true}),{status:fail?500:200});
  if(options.method==='POST' && url==='/api/'+(occupancy?'occupancy':'permits')+'/10/stations/initialize'){
   const names=occupancy?['Line & Grade','Architectural','Civil / Structural','Electrical','Mechanical','Sanitary','Plumbing','Electronics','Fire Safety']:['Office of the Building Official','Land Use and Zoning','Architectural','Structural','Line and Grade','Sanitary','Electrical','Mechanical','CINSP BFP City Fire Marshal'];
   const rows=offset=>names.map((name,index)=>({...station,id:offset+index,discipline_name:name,date_checked:null,date_approved:null,can_edit:name==='Electrical'}));
   if(!record.matrix.length)record.matrix=rows(60);
   record.sub_permits.forEach(sub=>{if(!sub.matrix.length)sub.matrix=rows(80)});record._version='initialized';
   return new Response(JSON.stringify({success:true}));
  }
  if(url==='/api/matrix/add' && options.method==='POST'){
   const payload=JSON.parse(options.body),matrix=payload.sub_permit_id?record.sub_permits.find(sub=>sub.id===payload.sub_permit_id).matrix:record.matrix;
   matrix.push({...station,id:52,discipline_name:payload.discipline_name});return new Response(JSON.stringify({success:true}));
  }
  const body=url.endsWith('/checklist')?{success:true,checklist_state:{},_version:'checklist'}:url.endsWith('/inspections')?{success:true,inspections:[]}:url==='/api/presence'?{success:true}:record;
  return new Response(JSON.stringify(body));
 };
 w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));await wait();
 for(const asset of ['project-identity.js','request-feedback.js','form-safety.js','permit-inspections.js','login-feedback.js','workspace-notice.js','occupancy-checklist.js','station-dates.js','remarks-viewer.js','project-approval.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',asset),'utf8'));
 const shell=fs.readFileSync(path.join(base,'features',occupancy?'occupancy':'building','details.html'),'utf8');
 const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const urlParams'));
 w.eval(controller);await w.fetchPermitData();w.enableEditingMode();
 return {dom,w,d,calls,alerts,record,setFailure(value){fail=value}};
}
function edit(w,d,id=50){
 const date=d.querySelector('.station-date-input[data-station="'+id+'"][data-field=date_checked]'),row=date.closest('tr');
 row.querySelector('select').value='Approved';date.value='2026-01-02';row.querySelector('[data-field=date_approved]').value='2026-01-03';
 for(const control of row.querySelectorAll('select,input[type=date]')){control.dispatchEvent(new w.Event('input',{bubbles:true}));control.dispatchEvent(new w.Event('change',{bubbles:true}));}
 return row;
}
for(const kind of ['building','occupancy']){
 test(kind+': assigned admin edits only permitted station rows and cannot alter workflow structure',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind,true,'admin');try{
   record.matrix.unshift({...record.matrix[0],id:49,discipline_name:'Sanitary',can_edit:false});
   for(const sub of record.sub_permits)sub.matrix.forEach(row=>row.can_edit=false);
   await w.fetchPermitData();w.enableEditingMode();
   assert.equal(d.querySelectorAll('#matrixTableBody select').length,1);
   assert.equal(d.querySelectorAll('#matrixTableBody .remarks-edit').length,1);
   assert.equal(d.querySelectorAll('#matrixTableBody .btn-icon-danger,.station-delete-btn').length,0);
   assert.equal(d.querySelector('.station-configuration-card').hidden,true);
   edit(w,d);d.getElementById('saveMatrixBtn').click();await wait();
   const payload=JSON.parse(calls.find(call=>call.options.method==='PUT').options.body);
   assert.deepEqual(payload.updatedMatrixRows.map(row=>row.id),['50']);
   calls.length=0;record.matrix=[];record.sub_permits=[];
   record[kind==='building'?'_standardBuildingStationsSupported':'_standardOccupancyStationsSupported']=true;
   await w.fetchPermitData();
   assert.equal(d.getElementById(kind==='building'?'standardBuildingStations':'standardOccupancyStations').hidden,true);
   await w.initializeStandardStations();
   if(kind==='building'){await w.postStationToMatrix('Electrical');await w.deleteStation('Electrical','permit_id=10');}
   else {await w.appendStation();await w.removeStation('Electrical');}
   assert.equal(calls.filter(call=>['POST','PUT','DELETE'].includes(call.options.method)&&call.url!=='/api/presence').length,0);
  }finally{dom.window.close()}
 });
 test(kind+': admin without assignments sees every station but has no routing edit controls',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind,true,'admin');try{
   record.matrix.forEach(row=>row.can_edit=false);for(const sub of record.sub_permits)sub.matrix.forEach(row=>row.can_edit=false);
   await w.fetchPermitData();w.enableEditingMode();
   assert.equal(d.getElementById('editTriggerBtn').style.display,'none');
   assert.equal(d.getElementById('saveMatrixBtn').style.display,'none');
   assert.equal(d.querySelectorAll('#matrixTableBody select,.station-date-input,.remarks-edit,.station-delete-btn,.btn-icon-danger').length,0);
   assert.equal(d.querySelectorAll('#matrixTableBody .station-engineer-name').length,kind==='building'?2:1);
   assert.match(d.getElementById('projectFinalApproval').textContent,/no station assignment/);
   assert.equal(calls.filter(call=>['POST','PUT','DELETE'].includes(call.options.method)&&call.url!=='/api/presence').length,0);
  }finally{dom.window.close()}
 });
 test(kind+': compact remarks preserve drafts and permissions until routing updates are saved',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   const original='Saved station remark',draft="Owner's signature\n"+'LONGWORD'.repeat(200)+'\n<img src=x onerror=alert(1)>';
   record.matrix[0].feedback_remarks=original;record.matrix.push({...record.matrix[0],id:52,discipline_name:'Sanitary',can_edit:false});
   await w.fetchPermitData();w.enableEditingMode();
   const stationRow=d.querySelector('[data-station-engineer="50"]').closest('tr'),otherRow=d.querySelector('[data-station-engineer="52"]').closest('tr');
   assert.ok(!stationRow.textContent.includes(original));assert.equal(stationRow.querySelector('.remarks-edit').textContent,'Edit remarks');assert.equal(otherRow.querySelector('.remarks-edit'),null);
   otherRow.querySelector('[data-station-remarks]').click();const popup=d.getElementById('stationRemarksDialog');assert.equal(popup.querySelector('h2').textContent,'Sanitary');popup.close();
   if(kind==='building')stationRow.querySelector('.remarks-edit').click();else w.openRemarksModal(stationRow.querySelector('.remarks-edit'));
   const textarea=d.getElementById(kind==='building'?'remarksModalTextarea':'activeRemarksText');assert.equal(textarea.value,original);textarea.value=draft;textarea.dispatchEvent(new w.Event('input',{bubbles:true}));
   if(kind==='building')w.applyRemarks();else w.saveRemarksToRow();
   assert.equal(stationRow.querySelector('input[type=hidden]').value,draft);assert.ok(!stationRow.textContent.includes('LONGWORD'));
   const view=stationRow.querySelector('[data-station-remarks]');view.click();assert.equal(popup.querySelector('#stationRemarksText').textContent,draft);assert.equal(popup.querySelector('img,textarea,input'),null);
   popup.querySelector('.remarks-viewer-close').click();assert.equal(d.activeElement,view);
   assert.equal(record.matrix[0].feedback_remarks,original);assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);
   d.getElementById('saveMatrixBtn').click();await wait();
   const payload=JSON.parse(calls.find(c=>c.options.method==='PUT').options.body);assert.equal(payload.updatedMatrixRows.find(row=>Number(row.id)===50).feedback_remarks,draft);assert.ok(!payload.updatedMatrixRows.some(row=>Number(row.id)===52));
  }finally{dom.window.close()}
 });
 test(kind+': configuration is hidden and existing empty routing can be initialized from the matrix once',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   const configuration=d.querySelector('.station-configuration-card');assert.equal(configuration.hidden,true);assert.ok(!configuration.contains(d.getElementById('matrixTableBody')));
   record[kind==='occupancy'?'_standardOccupancyStationsSupported':'_standardBuildingStationsSupported']=true;record.matrix=[];record.sub_permits=[];await w.fetchPermitData();
   const setup=d.getElementById(kind==='occupancy'?'standardOccupancyStations':'standardBuildingStations');assert.equal(setup.hidden,false);assert.ok(!configuration.contains(setup));
   const button=d.getElementById('initializeStandardStations');button.click();button.click();await wait();
   const posts=calls.filter(call=>call.url.endsWith('/stations/initialize'));assert.equal(posts.length,1);assert.equal(posts[0].options.headers['x-record-version'],'loaded-permit');
   assert.equal(record.matrix.length,9);assert.equal(setup.hidden,true);assert.equal(configuration.hidden,true);assert.equal(d.querySelectorAll('#matrixTableBody .station-engineer-name').length,9);
  }finally{dom.window.close()}
 });
 test(kind+': assigned engineer stays read-only and signature saves omit even spoofed names',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   assert.equal(d.querySelectorAll('#matrixTableBody input[type=text]').length,0);
   assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,'Original');
   const row=edit(w,d),spoof=d.createElement('input');spoof.id='eng_0';spoof.className='input-engineer';spoof.value='Spoofed name';row.append(spoof);
   d.querySelector('[data-station-engineer="50"]').textContent='Another spoof';
   d.getElementById('saveMatrixBtn').click();await wait();
   const payload=JSON.parse(calls.find(c=>c.options.method==='PUT').options.body);
   assert.ok(payload.updatedMatrixRows.every(r=>!Object.hasOwn(r,'engineer_name')));assert.equal(record.matrix[0].engineer_name,'Original');
   record.matrix[0].engineer_name='';record.matrix[0].assigned_operator_id=null;record.matrix[0].can_edit=false;
   await w.fetchPermitData();assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,'Unassigned');
  }finally{dom.window.close()}
 });
 test(kind+': saving a profile updates its station name and sub-permits without losing signature drafts',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   record.matrix.push({...record.matrix[0],id:52,can_edit:false,assigned_operator_id:2,engineer_name:'Other Operator'});
   await w.fetchPermitData();w.enableEditingMode();const row=edit(w,d);
   const remarks=row.querySelector('input[type=hidden]');remarks.value='Draft remarks';
   w.dispatchEvent(new w.CustomEvent('permit-profile-updated',{detail:{userId:1,displayName:'Engineer <Cruz> "Jr"'}}));
   assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,'Engineer <Cruz> "Jr"');
   assert.equal(d.querySelector('[data-station-engineer="52"]').textContent,'Other Operator');assert.ok(!d.querySelector('.station-engineer-name img'));
   if(kind==='building')assert.equal(d.querySelector('[data-station-engineer="51"]').textContent,'Engineer <Cruz> "Jr"');
   assert.ok(row.isConnected);assert.equal(row.querySelector('select').value,'Approved');assert.equal(row.querySelector('[data-field=date_checked]').value,'2026-01-02');assert.equal(remarks.value,'Draft remarks');
   assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);assert.equal(record._version,'loaded-permit');
   d.getElementById('saveMatrixBtn').click();await wait();const write=calls.find(c=>c.options.method==='PUT');
   assert.equal(write.options.headers['x-record-version'],'loaded-permit');assert.ok(JSON.parse(write.options.body).updatedMatrixRows.every(r=>!Object.hasOwn(r,'engineer_name')));
  }finally{dom.window.close()}
 });
 test(kind+': a profile-only rename makes no signature update and outdated engineer binding fails closed',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   w.dispatchEvent(new w.CustomEvent('permit-profile-updated',{detail:{userId:1,displayName:'Renamed Operator'}}));
   d.getElementById('saveMatrixBtn').click();await wait();assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);
   record._assignedEngineerProfileSupported=false;await w.fetchPermitData();w.enableEditingMode();
   assert.equal(d.querySelectorAll('#matrixTableBody select').length,0);assert.equal(d.getElementById('editTriggerBtn').style.display,'none');
  }finally{dom.window.close()}
 });
 test(kind+': shared access displays the last reviewer, and another assigned operator profile cannot replace it',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   record.assigned_stations=['Electrical','Sanitary'];record.matrix[0]={...record.matrix[0],engineer_name:'Previous Reviewer',assigned_operator_id:2,reviewing_operator_id:2,last_updated_by:2,assigned_operators:[{id:1,display_name:'Current Operator'},{id:2,display_name:'Previous Reviewer'}]};
   await w.fetchPermitData();w.enableEditingMode();const row=edit(w,d);
   assert.match(d.getElementById('projectFinalApproval').textContent,/Your assigned stations: Electrical, Sanitary/);
   w.dispatchEvent(new w.CustomEvent('permit-profile-updated',{detail:{userId:1,displayName:'Changed current operator'}}));
   assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,'Previous Reviewer');
   w.dispatchEvent(new w.CustomEvent('permit-profile-updated',{detail:{userId:2,displayName:'Renamed previous reviewer'}}));
   assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,'Renamed previous reviewer');assert.equal(row.querySelector('select').value,'Approved');assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);
   d.getElementById('saveMatrixBtn').click();await wait();const payload=JSON.parse(calls.find(call=>call.options.method==='PUT').options.body);
   assert.ok(payload.updatedMatrixRows.every(row=>!Object.hasOwn(row,'engineer_name')&&!Object.hasOwn(row,'last_updated_by')));
  }finally{dom.window.close()}
 });
 test(kind+': other stations stay read-only, including earlier table rows and sub-permits',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   record.matrix.unshift({...record.matrix[0],id:49,discipline_name:'Sanitary',can_edit:false});
   for(const sub of record.sub_permits)sub.matrix.forEach(r=>r.can_edit=false);
   record.final_approval={status:'ready',label:'Ready for final review',history:[]};record.assigned_station='Electrical';
   await w.fetchPermitData();w.enableEditingMode();
   assert.equal(d.querySelectorAll('#matrixTableBody select').length,1);assert.equal(d.querySelectorAll('.station-date-input').length,2);assert.equal(d.querySelectorAll('#matrixTableBody .btn-icon-danger').length,0);
   assert.match(d.getElementById('globalWorkflowStatus').textContent,/Ready for final review/);
   edit(w,d);d.getElementById('saveMatrixBtn').click();await wait();
   const payload=JSON.parse(calls.find(c=>c.options.method==='PUT').options.body);assert.deepEqual(payload.updatedMatrixRows.map(r=>r.id),['50']);
  }finally{dom.window.close()}
 });
 test(kind+': unassigned operator and outdated access server expose no edit controls',async()=>{
  const {dom,w,d,calls,record}=await fixture(kind);try{
   record.matrix.forEach(r=>r.can_edit=false);for(const sub of record.sub_permits)sub.matrix.forEach(r=>r.can_edit=false);
   await w.fetchPermitData();w.enableEditingMode();assert.equal(d.querySelectorAll('.station-date-input').length,0);assert.equal(d.getElementById('editTriggerBtn').style.display,'none');assert.match(d.getElementById('projectFinalApproval').textContent,/no station assignment/);
   record.matrix[0].can_edit=true;record._stationAccessSupported=false;await w.fetchPermitData();w.enableEditingMode();assert.equal(d.querySelectorAll('.station-date-input').length,0);assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);
  }finally{dom.window.close()}
 });
 test(kind+': untouched and reverted signature drafts do not submit requests',async()=>{
  const {dom,w,d,calls,alerts}=await fixture(kind);try{
   d.getElementById('saveMatrixBtn').click();await wait();
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);assert.ok(!d.querySelector('.station-date-input'));assert.match(alerts.at(-1),/No signature changes/);
   w.enableEditingMode();const row=edit(w,d);
   row.querySelector('select').value='Pending';row.querySelector('[data-field=date_checked]').value='2026-01-01';row.querySelector('[data-field=date_approved]').value='';
   d.getElementById('saveMatrixBtn').click();await wait();
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);assert.ok(!d.querySelector('.station-date-input'));assert.equal(w.FormSafety.dirty('matrixTableBody'),false);
  }finally{dom.window.close()}
 });
 test(kind+': date-only draft is a real change, with unchanged stations omitted',async()=>{
  const {dom,w,d,calls}=await fixture(kind);try{
   d.querySelector('[data-field=date_approved]').value='2026-01-02';d.getElementById('saveMatrixBtn').click();await wait();
   const writes=calls.filter(call=>call.options.method==='PUT');assert.equal(writes.length,1);
   const rows=JSON.parse(writes[0].options.body).updatedMatrixRows;assert.equal(rows.length,1);assert.equal(rows[0].id,'50');assert.equal(rows[0].signature_status,'Pending');assert.equal(rows[0].date_checked,'2026-01-01');assert.equal(rows[0].date_approved,'2026-01-02');
  }finally{dom.window.close()}
 });
 test(kind+': an outdated server cannot accept and silently lose draft dates',async()=>{
  const {dom,w,d,calls,alerts}=await fixture(kind,false);try{
   const row=edit(w,d);d.getElementById('saveMatrixBtn').click();await wait();
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);assert.ok(row.isConnected);assert.equal(row.querySelector('[data-field=date_checked]').value,'2026-01-02');assert.equal(row.querySelector('[data-field=date_approved]').value,'2026-01-03');assert.match(alerts.at(-1),/server needs to be restarted/);assert.equal(w.FormSafety.dirty('matrixTableBody'),true);
  }finally{dom.window.close()}
 });
 test(kind+': status and dates submit together only on Save Signature Updates',async()=>{
  const {dom,w,d,calls}=await fixture(kind);try{
   edit(w,d);if(kind==='building')edit(w,d,51);
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);assert.equal(d.querySelectorAll('.station-date-dialog').length,0);
   assert.equal(d.getElementById('saveMatrixBtn').textContent,'Save Signature Updates');
   d.getElementById('saveMatrixBtn').click();await wait();
   const writes=calls.filter(call=>call.options.method==='PUT');assert.equal(writes.length,1);assert.equal(writes[0].url,'/api/'+(kind==='building'?'permits':'occupancy')+'/10/signatures');assert.equal(writes[0].options.headers['x-record-version'],'loaded-permit');
   const rows=JSON.parse(writes[0].options.body).updatedMatrixRows;assert.equal(rows.length,kind==='building'?2:1);
   for(const row of rows){assert.equal(row.signature_status,'Approved');assert.equal(row.date_checked,'2026-01-02');assert.equal(row.date_approved,'2026-01-03');assert.ok(!Object.hasOwn(row,'engineer_name'));}
   assert.ok(!d.querySelector('.station-date-input'),'Success returns the matrix to view mode');
  }finally{dom.window.close()}
 });
 test(kind+': cancel discards draft dates and does not submit',async()=>{
  const {dom,w,d,calls}=await fixture(kind);try{
   edit(w,d);assert.equal(w.FormSafety.dirty('matrixTableBody'),true);w.cancelEditingMode();
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);w.enableEditingMode();
   assert.equal(d.querySelector('[data-field=date_checked]').value,'2026-01-01');assert.equal(d.querySelector('[data-field=date_approved]').value,'');assert.equal(d.querySelector('#matrixTableBody select').value,'Pending');
  }finally{dom.window.close()}
 });
 test(kind+': invalid date order blocks the entire signature save',async()=>{
  const {dom,w,d,calls}=await fixture(kind);try{
   const row=edit(w,d);row.querySelector('[data-field=date_approved]').value='2026-01-01';d.getElementById('saveMatrixBtn').click();await wait();
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,0);assert.match(row.querySelector('[data-field=date_approved]').validationMessage,/cannot be earlier/);assert.equal(d.getElementById('saveMatrixBtn').disabled,false);
  }finally{dom.window.close()}
 });
 test(kind+': failed combined save retains status and both date drafts for retry',async()=>{
  const {dom,w,d,calls,setFailure}=await fixture(kind);try{
   setFailure(true);const row=edit(w,d);d.getElementById('saveMatrixBtn').click();await wait();
   assert.ok(row.isConnected);assert.equal(row.querySelector('select').value,'Approved');assert.equal(row.querySelector('[data-field=date_checked]').value,'2026-01-02');assert.equal(row.querySelector('[data-field=date_approved]').value,'2026-01-03');assert.equal(w.FormSafety.dirty('matrixTableBody'),true);
   assert.equal(calls.filter(call=>call.options.method==='PUT').length,1);assert.equal(d.getElementById('saveMatrixBtn').disabled,false);
  }finally{dom.window.close()}
 });
}
test('administrator preview includes combined dates and hides unchanged calendar values',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'});try{
  const w=dom.window;w.eval(fs.readFileSync(path.join(base,'assets/permits/approval-preview.js'),'utf8'));
  const before={id:50,discipline_name:'<Electrical>',signature_status:'Pending',date_checked:'2026-01-01T00:00:00Z',date_approved:''};
  const request={change_type:'matrix_update',changes:{_before:{matrix:[before]},updatedMatrixRows:[{id:50,signature_status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02'}]}};
  for(const compact of [true,false]){const html=w.renderApprovalChanges(request,{compact});assert.match(html,/Date Approved/);assert.match(html,/2026-01-02/);assert.match(html,/Status/);assert.ok(!html.includes('Date Checked'));assert.ok(!html.includes('<Electrical>'));}
 }finally{dom.window.close()}
});
test('building engineer names and draft remarks preserve quotes without changing the table controls',async()=>{
 const {dom,w,d,record}=await fixture('building');try{
  const name='Engineer "Cruz"',remarks='Check owner\'s signature "A"';record.matrix[0].engineer_name=name;record.matrix[0].feedback_remarks=remarks;
  await w.fetchPermitData();w.enableEditingMode();assert.equal(d.querySelector('[data-station-engineer="50"]').textContent,name);assert.ok(!d.getElementById('eng_0'));assert.equal(d.getElementById('rem_0').value,remarks);
  let received;w.openRemarksModal=(...args)=>{received=args};d.querySelector('[data-remarks-index="0"]').click();assert.equal(received[2],remarks);
  d.getElementById('rem_0').value='Edited draft';d.querySelector('[data-remarks-index="0"]').click();assert.equal(received[2],'Edited draft');
 }finally{dom.window.close()}
});

test('building discipline templates populate the dropdown; editing them keeps active stations unchanged',async()=>{
 const {dom,w,d,calls}=await fixture('building');try{
  w.cancelEditingMode();
  w.localStorage.setItem('buildingQuickTemplates:v1:1',JSON.stringify(['Electrical','Personal station']));
  w.eval(fs.readFileSync(path.join(base,'assets/permits/quick-templates.js'),'utf8'));
  const select=d.getElementById('disciplineSelect'),toggle=d.getElementById('manageTemplatesBtn'),editor=d.getElementById('templateEditor');
  assert.deepEqual([...select.options].map(option=>option.value),['','Electrical','Personal station']);assert.equal(editor.hidden,true);
  toggle.click();assert.equal(editor.hidden,false);assert.equal(toggle.textContent,'Done');assert.equal(d.querySelectorAll('.btn-quick-add').length,0);
  const active=d.getElementById('disciplineConfigList').textContent;
  d.querySelector('#quickAddTemplates button[aria-label="Remove Electrical template"]').click();
  assert.deepEqual([...select.options].map(option=>option.value),['','Personal station']);assert.equal(d.getElementById('disciplineConfigList').textContent,active);
  d.getElementById('newTemplateName').value='New station';d.getElementById('quickTemplateForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok([...select.options].some(option=>option.value==='New station'));assert.deepEqual(JSON.parse(w.localStorage.getItem('buildingQuickTemplates:v1:1')),['Personal station','New station']);
  assert.equal(calls.filter(call=>['PUT','POST','DELETE'].includes(call.options.method)&&call.url!=='/api/presence').length,0);
  toggle.click();assert.equal(editor.hidden,true);assert.equal(toggle.textContent,'Manage');
  await wait(); // Let the form reset finish before closing its document.
 }finally{dom.window.close()}
});
test('building dropdown Add assigns the selected station to the chosen main or sub-permit flow',async()=>{
 const {dom,w,d,calls}=await fixture('building');try{
  w.cancelEditingMode();w.setupConfigFormListeners();w.eval(fs.readFileSync(path.join(base,'assets/permits/quick-templates.js'),'utf8'));
  const select=d.getElementById('disciplineSelect'),scope=d.getElementById('targetFlowScopeSelector'),form=d.getElementById('addDisciplineForm');
  for(const target of ['parent-0','sub-7']){
   scope.value=target;scope.dispatchEvent(new w.Event('change'));select.value='Mechanical';
   form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
   const write=calls.filter(call=>call.url==='/api/matrix/add').at(-1);assert.ok(write);assert.equal(write.options.headers['x-record-version'],'loaded-permit');
   assert.deepEqual(JSON.parse(write.options.body),target==='parent-0'?{discipline_name:'MECHANICAL',permit_id:'10'}:{discipline_name:'MECHANICAL',sub_permit_id:7});
   assert.equal(select.value,'');assert.equal(scope.value,target);assert.match(d.getElementById('disciplineConfigList').textContent,/MECHANICAL/);
  }
  assert.equal(calls.filter(call=>call.url==='/api/matrix/add').length,2);
 }finally{dom.window.close()}
});
