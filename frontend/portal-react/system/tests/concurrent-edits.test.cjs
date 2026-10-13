const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
async function fixture(kind, {subPermits=[]}={}) {
    const occupancy=kind==='occupancy',calls=[];
    const dom=new JSDOM(`<div id="system-react-root" data-page="${occupancy?'permits-occupancy_edit':'permits-edit'}"></div>`,{url:'http://localhost/'+(occupancy?'occupancy_edit':'edit')+'?id=10',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    const w=dom.window,d=w.document;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
    w.AbortController=AbortController;w.alert=()=>{};w.confirm=()=>true;
    w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,username:'fixture',role:'operator'}));
    const record={id:10,project_title:'Fixture',location:'Location',owner_name:'Owner',permit_date:'2026-01-01',date_applied:'2026-01-01',lot_numbers:[],sub_permits:subPermits,rejection_history:'[]',_version:'loaded-permit',_stationAccessSupported:true,_assignedEngineerProfileSupported:true,matrix:[{id:50,can_edit:true,assigned_operator_id:1,engineer_profile_bound:true,discipline_name:'Electrical',engineer_name:'Original',signature_status:'Pending',feedback_remarks:''}]};
    w.fetch=async(url,options={})=>{
        calls.push({url,options});
        if(['PUT','DELETE'].includes(options.method))return new Response(JSON.stringify({success:false,conflict:true,message:'This record was updated by another user. Copy your unsaved inputs before refreshing.'}),{status:409});
        let body=url.endsWith('/checklist')?{success:true,checklist_state:{},_version:'loaded-checklist'}:url.endsWith('/inspections')?{success:true,inspections:[{id:50,inspection_type:'Preliminary',inspection_date:'2026-01-01',inspector_name:'Inspector',result:'Scheduled',findings:'Original',_version:'loaded-inspection'}]}:url==='/api/presence'?{success:true}:record;
        return new Response(JSON.stringify(body),{status:200});
    };
    w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));
    await wait();
    for(const asset of ['project-identity.js','request-feedback.js','form-safety.js','permit-inspections.js','occupancy-checklist.js','station-dates.js','project-approval.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',asset),'utf8'));
    const shell=fs.readFileSync(path.join(base,'features',occupancy?'occupancy':'building','details.html'),'utf8');
    const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const urlParams'));
    w.eval(controller+(occupancy?'\nwindow.testSaveInspection=saveInspection;window.testSaveChecklist=saveChecklist;':''));
    await w.fetchPermitData();
    return {dom,w,d,calls};
}
test('Building tabs count main/sub-permit stations and inspections, preserve drafts and support keyboard navigation',async()=>{
    const {dom,w,d,calls}=await fixture('building',{subPermits:[{id:7,sub_project_title:'Annex',matrix:[{id:51,discipline_name:'Sanitary',signature_status:'Pending',engineer_name:'Reviewer',can_edit:false}]}]});
    try {
        await w.loadInspections();
        const routing=d.getElementById('building-routing-tab'),inspection=d.getElementById('building-inspection-tab');
        assert.equal(d.getElementById('tbRouting').textContent,'2');
        assert.equal(d.getElementById('tbInspection').textContent,'1');
        assert.equal(d.getElementById('panel-routing').hidden,false);
        assert.equal(d.getElementById('panel-inspection').hidden,true);
        assert.ok(d.getElementById('panel-routing').contains(d.getElementById('projectFinalApproval')));
        w.enableEditingMode();
        const input=d.querySelector('#matrixTableBody select');
        w.FormSafety.remember(d.getElementById('matrixTableBody'));input.value='Approved';
        const requests=calls.length;
        inspection.click();
        assert.equal(inspection.getAttribute('aria-selected'),'true');
        assert.equal(d.getElementById('panel-routing').hidden,true);
        assert.equal(d.getElementById('panel-inspection').hidden,false);
        inspection.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
        assert.equal(d.activeElement,routing);
        assert.equal(routing.getAttribute('aria-selected'),'true');
        assert.equal(d.querySelector('#matrixTableBody select'),input);
        assert.equal(input.value,'Approved');assert.equal(w.FormSafety.dirty('matrixTableBody'),true);
        assert.equal(d.getElementById('panel-inspection').hidden,true);
        routing.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
        assert.equal(d.activeElement,d.getElementById('building-requirements-tab'));assert.equal(d.getElementById('panel-checklist').hidden,false);
        assert.equal(calls.length,requests,'Tab changes must not refetch or submit data');
    } finally {dom.window.close();}
});
for(const kind of ['building','occupancy'])test(kind+': conflicting routing save keeps the edited inputs and original version',async()=>{
    const {dom,w,d,calls}=await fixture(kind);
    try {
        w.enableEditingMode();
        const input=d.querySelector('#matrixTableBody select');assert.ok(input);input.value='Approved';
        const count=calls.filter(c=>c.options.method!=='POST' && !c.options.method).length;
        d.getElementById('saveMatrixBtn').click();await wait();
        const write=calls.find(c=>c.options.method==='PUT');assert.ok(write);assert.equal(write.options.headers['x-record-version'],'loaded-permit');
        assert.equal(input.value,'Approved');assert.ok(input.isConnected);assert.equal(d.getElementById('saveMatrixBtn').disabled,false);
        assert.equal(w.FormSafety.dirty('matrixTableBody'),true);
        assert.equal(calls.filter(c=>!c.options.method).length,count,'A conflict must not silently reload the editor');
        assert.match(d.body.textContent,/updated by another user/);
    } finally {dom.window.close()}
});
test('inspection and checklist conflicts retain their independent loaded versions and drafts',async()=>{
    const {dom,w,d,calls}=await fixture('occupancy');
    try {
        await w.loadInspections();w.openInspModal(50);w.FormSafety.remember(d.getElementById('inspModal'));
        d.getElementById('inspFindings').value='Unsaved findings';await w.testSaveInspection();
        const inspection=calls.find(c=>c.options.method==='PUT');assert.equal(inspection.options.headers['x-record-version'],'loaded-inspection');
        assert.equal(d.getElementById('inspFindings').value,'Unsaved findings');assert.equal(d.getElementById('inspModal').style.display,'flex');assert.equal(w.FormSafety.dirty('inspModal'),true);
        await w.loadChecklist();w.toggleClItem('cl01');await w.testSaveChecklist();
        const checklist=calls.find(c=>c.options.method==='PUT'&&c.url.endsWith('/checklist'));
        assert.equal(checklist.options.headers['x-record-version'],'loaded-checklist');assert.equal(JSON.parse(checklist.options.body).checklist_state.cl01,true);
        assert.equal(w.FormSafety.dirty('checklistContainer'),true);assert.equal(d.getElementById('saveClBtn').disabled,false);
        await w.deleteInspection(50);
        assert.equal(calls.find(c=>c.options.method==='DELETE').options.headers['x-record-version'],'loaded-inspection');
    } finally {dom.window.close()}
});
