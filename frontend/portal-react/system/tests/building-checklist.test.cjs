const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),wait=()=>new Promise(resolve=>setTimeout(resolve,40));
async function fixture({failLoad=false,failSave=false}={}){
    const dom=new JSDOM('<div id="system-react-root" data-page="permits-edit"></div>',{url:'http://localhost/edit?id=10',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    const w=dom.window,d=w.document,calls=[];let stored={land_title:true},version='checklist-v1',fail=failLoad;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
    w.AbortController=AbortController;w.alert=()=>{};w.confirm=()=>true;
    w.fetch=async(url,options={})=>{
        calls.push({url,options});
        if(options.method==='PUT'){
            await wait();
            if(failSave)return new Response(JSON.stringify({success:false,conflict:true,message:'This checklist was updated by another user. Copy your unsaved inputs before refreshing.'}),{status:409});
            assert.equal(options.headers['x-record-version'],version);
            stored=JSON.parse(options.body).checklist_state;version='checklist-v2';
            return new Response(JSON.stringify({success:true,_version:version}));
        }
        if(fail)return new Response(JSON.stringify({success:false,message:'Fixture load failure'}),{status:503});
        return new Response(JSON.stringify({success:true,checklist_state:stored,_version:version}));
    };
    w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));await wait();
    for(const file of ['form-safety.js','request-feedback.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',file),'utf8'));
    w.eval(fs.readFileSync(path.resolve(base,'../../../backend/monitorBP backend/buildingRequirements.js'),'utf8'));
    w.eval(fs.readFileSync(path.join(base,'assets/permits/building-checklist.js'),'utf8'));await wait();
    const choose=key=>{const input=d.querySelector('[data-requirement="'+key+'"]');input.click();return input;};
    return {dom,w,d,calls,choose,recover(){fail=false;},stored:()=>stored};
}
test('Building requirements preserve photo conditions, procedure, independent saved progress and tab drafts',async()=>{
    const f=await fixture(),{dom,w,d,calls,choose}=f;
    try{
        assert.equal(d.querySelectorAll('[data-requirement]').length,16);
        assert.equal(d.getElementById('tbChecklist').textContent,'1/16');
        assert.equal(d.querySelectorAll('#buildingProcedure input[type="checkbox"]').length,6);
        assert.equal(d.querySelectorAll('.tag-req').length,12);assert.equal(d.querySelectorAll('.tag-condition').length,4);
        assert.equal(d.getElementById('sideClPct').textContent,'6%');assert.equal(d.getElementById('ringPct').textContent,'6%');
        for(const text of ['for fence, 3 sets only','For 2 storeys or more','For 3 storeys and above','Photocopy or CND','Consent / SPA'])assert.ok(d.getElementById('panel-checklist').textContent.includes(text));
        d.getElementById('building-requirements-tab').click();choose('plans');
        choose('procedure_initial_evaluation');
        assert.equal(d.getElementById('tbChecklist').textContent,'3/16');assert.equal(w.FormSafety.dirty('checklistContainer'),true);
        assert.equal(d.getElementById('sideClPct').textContent,'19%');assert.equal(d.getElementById('ringPct').textContent,'19%');
        assert.equal(d.querySelector('#buildingProcedure .cl-section-count').textContent,'1/6');
        const before=calls.length;d.getElementById('building-routing-tab').click();d.getElementById('building-requirements-tab').click();
        assert.equal(d.querySelector('[data-requirement="plans"]').checked,true);assert.equal(calls.length,before);
        d.getElementById('saveClBtn').click();d.getElementById('saveClBtn').click();await wait();await wait();
        assert.equal(calls.filter(call=>call.options.method==='PUT').length,1);assert.equal(f.stored().plans,true);assert.equal(f.stored().procedure_initial_evaluation,true);
        assert.equal(w.FormSafety.dirty('checklistContainer'),false);assert.equal(d.getElementById('saveClBtn').disabled,false);
        assert.match(d.getElementById('buildingChecklistFeedback').textContent,/Checklist saved/);
        d.getElementById('reloadBuildingChecklist').click();await wait();assert.equal(d.querySelector('[data-requirement="plans"]').checked,true);assert.equal(d.querySelector('[data-requirement="procedure_initial_evaluation"]').checked,true);
    }finally{dom.window.close();}
});

test('Building summary and accessible progress reach completion and checkbox focus survives updates',async()=>{
    const {dom,d,choose}=await fixture();
    try{
        const input=d.querySelector('[data-requirement="plans"]');input.focus();choose('plans');assert.equal(d.activeElement,input);
        for(const checkbox of d.querySelectorAll('[data-requirement]'))if(!checkbox.checked)checkbox.click();
        assert.equal(d.getElementById('sideClPct').textContent,'100%');assert.equal(d.getElementById('tbChecklist').textContent,'16/16');
        assert.equal(d.getElementById('sideClStatus').textContent,'Checklist complete');
        assert.equal(d.querySelector('.permit-checklist-progress').getAttribute('aria-valuenow'),'100');
        assert.equal(d.querySelector('#checklistSideCard [role="progressbar"]').getAttribute('aria-valuenow'),'100');
        assert.equal(d.getElementById('sideClCount').textContent,'16 of 16 items');
    }finally{dom.window.close();}
});
test('Building checklist conflict keeps changes and original version; refresh cancellation retains the draft',async()=>{
    const f=await fixture({failSave:true}),{dom,w,d,calls,choose}=f;
    try{
        choose('plans');d.getElementById('saveClBtn').click();await wait();await wait();
        assert.equal(calls.find(call=>call.options.method==='PUT').options.headers['x-record-version'],'checklist-v1');
        assert.equal(d.querySelector('[data-requirement="plans"]').checked,true);assert.equal(w.FormSafety.dirty('checklistContainer'),true);
        assert.match(d.body.textContent,/updated by another user/);assert.equal(d.getElementById('saveClBtn').disabled,false);
        const before=calls.length;w.confirm=()=>false;d.getElementById('reloadBuildingChecklist').click();await wait();
        assert.equal(calls.length,before);assert.equal(d.querySelector('[data-requirement="plans"]').checked,true);
    }finally{dom.window.close();}
});
test('failed checklist loading disables edits and can recover without overwriting saved values',async()=>{
    const f=await fixture({failLoad:true}),{dom,d}=f;
    try{
        assert.equal(d.getElementById('saveClBtn').disabled,true);assert.ok([...d.querySelectorAll('[data-requirement]')].every(input=>input.disabled));
        assert.match(d.getElementById('buildingChecklistFeedback').textContent,/Unable to load/);
        f.recover();d.getElementById('reloadBuildingChecklist').click();await wait();
        assert.equal(d.getElementById('saveClBtn').disabled,false);assert.equal(d.querySelector('[data-requirement="land_title"]').checked,true);
    }finally{dom.window.close();}
});
