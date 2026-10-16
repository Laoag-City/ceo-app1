const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const base=path.resolve(__dirname,'..'),wait=()=>new Promise(resolve=>setTimeout(resolve,50));
async function fixture(kind,{initial=[],role='operator'}={}) {
    const dom=new JSDOM(`<div id="system-react-root" data-page="${kind==='permits'?'permits-edit':'permits-occupancy_edit'}"></div>`,{url:'http://localhost/edit?id=10',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    const w=dom.window,d=w.document,calls=[],errors=[],alerts=[];
    let records=structuredClone(initial),failure=false,gate=null,release;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
    w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}));
    w.AbortController=AbortController;w.confirm=()=>true;w.alert=message=>alerts.push(message);
    w.fetch=async(url,options={})=>{
        if(!url.includes('/inspections'))return new Response(JSON.stringify({success:true}));
        calls.push({url,options});
        if(gate&&options.method)await gate;
        if(failure)return new Response(JSON.stringify({success:false,conflict:true,message:'Refresh before saving; this inspection changed.'}),{status:options.method?409:500});
        if(options.method==='POST')records.push({id:7,...JSON.parse(options.body),_version:'new-record'});
        if(options.method==='PUT')records=records.map(row=>({...row,...JSON.parse(options.body),_version:'updated-record'}));
        return new Response(JSON.stringify(options.method?{success:true,pending:options.method==='DELETE',message:options.method==='DELETE'?'Inspection deletion submitted for administrator approval. The permit is retained.':'Inspection saved.'}:{success:true,inspections:records}));
    };
    w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));await wait();
    for(const asset of ['request-feedback.js','form-safety.js','permit-inspections.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',asset),'utf8'));
    const report=w.RequestFeedback.report;w.RequestFeedback.report=error=>{errors.push(error);report(error);};
    await w.loadInspections();
    return {dom,w,d,calls,errors,alerts,fail(value){failure=value;},pause(){gate=new Promise(resolve=>release=resolve);},resume(){release();gate=null;}};
}
const existing={id:1,inspection_type:'Preliminary',inspection_date:'2026-10-12',inspector_name:'Inspector',result:'Scheduled',findings:'Original findings',next_inspection_date:'2026-10-19',_version:'loaded-version'};
for(const kind of ['permits','occupancy']) {
    test(kind+': admin reads and refreshes inspections without operator CRUD controls',async()=>{
        const f=await fixture(kind,{initial:[existing],role:'admin'});try{
            assert.match(f.d.getElementById('inspectionList').textContent,/Original findings/);
            assert.equal(f.d.querySelector('.btn-add-insp,.insp-card-footer'),null);
            f.w.openInspModal(1);assert.notEqual(f.d.getElementById('inspModal').style.display,'flex');
            await f.w.saveInspection();await f.w.deleteInspection(1);await f.w.loadInspections();
            assert.equal(f.calls.filter(call=>call.options.method).length,0);
            assert.equal(f.d.querySelectorAll('.insp-card').length,1);
        }finally{f.dom.window.close()}
    });
    test(kind+': shared layout, new-inspection validation, one submission and saved refresh',async()=>{
        const f=await fixture(kind);try {
            assert.equal(f.d.querySelector('[data-inspections-kind]').dataset.inspectionsKind,kind);
            assert.equal(f.d.querySelectorAll('#inspModal').length,1);
            assert.match(f.d.getElementById('inspectionList').textContent,/No inspections/);
            f.w.openInspModal();
            assert.equal(f.d.getElementById('inspModal').style.display,'flex');
            assert.equal(f.d.activeElement.id,'inspType');
            await f.w.saveInspection();assert.equal(f.calls.filter(call=>call.options.method).length,0);
            f.d.getElementById('inspInspector').value='Inspector Cruz';f.d.getElementById('inspFindings').value='Site visit';
            f.d.getElementById('inspDate').value='2026-10-12';f.d.getElementById('inspNextDate').value='2026-10-11';
            await f.w.saveInspection();assert.equal(f.calls.filter(call=>call.options.method).length,0);
            f.d.getElementById('inspNextDate').value='2026-10-19';
            f.pause();const saving=f.w.saveInspection();await Promise.resolve();await f.w.saveInspection();
            assert.equal(f.d.getElementById('inspSaveBtn').disabled,true);
            assert.equal(f.calls.filter(call=>call.options.method==='POST').length,1);
            const write=f.calls.find(call=>call.options.method==='POST');assert.equal(write.url,'/api/'+kind+'/10/inspections');assert.equal(write.options.headers['x-permit-request'],'1');
            assert.equal(JSON.parse(write.options.body).inspection_date,'2026-10-12');
            f.resume();await saving;
            assert.equal(f.d.getElementById('inspModal').style.display,'none');
            assert.match(f.d.getElementById('inspectionList').textContent,/Inspector Cruz/);
            assert.deepEqual([...f.d.querySelectorAll('.insp-card-footer button')].map(button=>button.textContent),['Edit','Delete']);
        } finally {f.dom.window.close();}
    });
    test(kind+': independent inspection version and draft survive conflict; failed refresh keeps the list',async()=>{
        const f=await fixture(kind,{initial:[existing]});try {
            f.w.openInspModal(1);f.d.getElementById('inspFindings').value='Unsaved findings';f.fail(true);
            await f.w.saveInspection();
            const write=f.calls.find(call=>call.options.method==='PUT');assert.equal(write.url,'/api/'+kind+'/10/inspections/1');assert.equal(write.options.headers['x-record-version'],'loaded-version');
            assert.equal(f.d.getElementById('inspModal').style.display,'flex');assert.equal(f.d.getElementById('inspFindings').value,'Unsaved findings');assert.equal(f.w.FormSafety.dirty('inspModal'),true);
            await f.w.loadInspections();assert.match(f.d.getElementById('inspectionList').textContent,/Original findings/);assert.match(f.d.getElementById('inspectionFeedback').textContent,/could not be refreshed/);
            f.w.confirm=()=>false;f.w.closeInspModal();assert.equal(f.d.getElementById('inspModal').style.display,'flex');
            f.fail(false);await f.w.saveInspection();assert.match(f.d.getElementById('inspectionList').textContent,/Unsaved findings/);
        } finally {f.dom.window.close();}
    });
    test(kind+': deleting requests approval once and keeps the inspection; cancel sends nothing',async()=>{
        const f=await fixture(kind,{initial:[existing]});try {
            f.w.confirm=()=>false;await f.w.deleteInspection(1);assert.equal(f.calls.filter(call=>call.options.method==='DELETE').length,0);
            f.w.confirm=()=>true;f.pause();const deleting=f.w.deleteInspection(1);await Promise.resolve();await f.w.deleteInspection(1);
            assert.equal(f.calls.filter(call=>call.options.method==='DELETE').length,1);
            assert.equal(f.calls.find(call=>call.options.method==='DELETE').options.headers['x-record-version'],'loaded-version');
            f.resume();await deleting;
            assert.equal(f.d.querySelectorAll('.insp-card').length,1);assert.match(f.alerts[0],/administrator approval/);
        } finally {f.dom.window.close();}
    });
    test(kind+': hostile text stays text, long findings wrap, and modal uses the office calendar',async()=>{
        const f=await fixture(kind,{initial:[{...existing,inspector_name:'<img src=x onerror=bad()>',findings:'<script>bad()</script>\n'+ 'X'.repeat(1000)}]});try {
            assert.equal(f.d.querySelector('.insp-card img,.insp-card script'),null);
            assert.match(f.d.querySelector('.insp-findings').textContent,/<script>bad\(\)<\/script>/);
            const RealDate=f.w.Date;f.w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-11T17:30:00Z']));}};
            f.w.openInspModal();assert.equal(f.d.getElementById('inspDate').value,'2026-10-12');
            f.w.closeInspModal();assert.equal(f.d.getElementById('inspModal').style.display,'none');
        } finally {f.dom.window.close();}
    });
}

test('both admin request cards describe inspection-only deletion and escape submitted findings',()=>{
    const dom=new JSDOM('',{runScripts:'outside-only'});try {
        for(const asset of ['approval-preview.js','admin-request-cards.js'])dom.window.eval(fs.readFileSync(path.join(base,'assets/permits',asset),'utf8'));
        for(const kind of ['permits','occupancy']) {
            dom.window.document.body.innerHTML=dom.window.renderAdminRequestCard({id:1,change_type:'inspection_delete',project_title:'Keep permit',changes:{inspection_id:7,inspection:{findings:'<img src=x onerror=bad()>'}}},kind);
            assert.match(dom.window.document.body.textContent,/Delete inspection #7 only/);assert.match(dom.window.document.body.textContent,/parent permit will remain/);assert.equal(dom.window.document.querySelector('img[onerror]'),null);
        }
    } finally {dom.window.close();}
});
