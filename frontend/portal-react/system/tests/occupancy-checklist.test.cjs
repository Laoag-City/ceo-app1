const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),wait=()=>new Promise(resolve=>setTimeout(resolve,45));
async function fixture(){
    const dom=new JSDOM('<div id="system-react-root" data-page="permits-occupancy_edit"></div>',{url:'http://localhost/occupancy/edit?id=10',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    const w=dom.window,d=w.document,calls=[];let state={cl01:true},version='occupancy-checklist-v1',failLoad=false,failSave=false;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.AbortController=AbortController;w.confirm=()=>true;w.alert=()=>{};
    w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role:'operator'}));
    w.fetch=async(url,options={})=>{
        if(!url.endsWith('/checklist'))return new Response(JSON.stringify({success:true}));calls.push({url,options});
        if(options.method==='PUT'){
            await wait();if(failSave)return new Response(JSON.stringify({success:false,conflict:true,message:'This checklist was updated by another user. Copy your unsaved inputs before refreshing.'}),{status:409});
            assert.equal(options.headers['x-record-version'],version);state=JSON.parse(options.body).checklist_state;version='occupancy-checklist-v2';
            return new Response(JSON.stringify({success:true,_version:version}));
        }
        if(failLoad)return new Response(JSON.stringify({success:false,message:'Fixture load error'}),{status:503});
        return new Response(JSON.stringify({success:true,checklist_state:state,_version:version}));
    };
    w.eval(fs.readFileSync(path.resolve(base,'../system-dist/app.js'),'utf8'));await wait();
    for(const file of ['request-feedback.js','form-safety.js','occupancy-checklist.js'])w.eval(fs.readFileSync(path.join(base,'assets/permits',file),'utf8'));
    const shell=fs.readFileSync(path.join(base,'features/occupancy/details.html'),'utf8');
    const source=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(code=>code.includes('const urlParams'));
    w.eval(source+'\nwindow.testSaveChecklist=saveChecklist;');await w.loadChecklist();
    return {dom,w,d,calls,state:()=>state,failLoads(value){failLoad=value;},failWrites(value){failSave=value;}};
}
test('Occupancy uses the matching summary and native checkboxes while retaining saved document keys',async()=>{
    const f=await fixture(),{dom,w,d,calls}=f;
    try{
        assert.equal(d.querySelectorAll('[data-checklist-item]').length,15);assert.equal(d.getElementById('tbChecklist').textContent,'1/15');
        assert.equal(d.getElementById('ringPct').textContent,'7%');assert.equal(d.getElementById('sideClPct').textContent,'7%');
        const input=d.querySelector('[data-checklist-item="cl02"]');assert.equal(input.closest('label').querySelector('.tag-req').textContent,'Required');
        input.focus();input.click();assert.equal(d.activeElement,input);assert.equal(input.checked,true);assert.equal(d.getElementById('tbChecklist').textContent,'2/15');
        assert.equal(w.FormSafety.dirty('checklistContainer'),true);
        const save=w.testSaveChecklist();await w.testSaveChecklist();await save;
        assert.equal(calls.filter(call=>call.options.method==='PUT').length,1);assert.equal(f.state().cl02,true);assert.equal(w.FormSafety.dirty('checklistContainer'),false);
        await w.loadChecklist();assert.equal(d.querySelector('[data-checklist-item="cl02"]').checked,true);
        assert.match(d.getElementById('checklistFeedback').textContent,/Saved checklist loaded/);
    }finally{dom.window.close();}
});
test('Occupancy refresh cancellation and failed saves retain drafts; loading errors can recover',async()=>{
    const f=await fixture(),{dom,w,d,calls}=f;
    try{
        d.querySelector('[data-checklist-item="cl02"]').click();w.confirm=()=>false;
        const count=calls.length;await w.loadChecklist();assert.equal(calls.length,count);assert.equal(d.querySelector('[data-checklist-item="cl02"]').checked,true);
        f.failWrites(true);await w.testSaveChecklist();
        assert.equal(d.querySelector('[data-checklist-item="cl02"]').checked,true);assert.equal(w.FormSafety.dirty('checklistContainer'),true);
        assert.equal(calls.find(call=>call.options.method==='PUT').options.headers['x-record-version'],'occupancy-checklist-v1');
        assert.match(d.getElementById('checklistFeedback').textContent,/changes are kept/);
        w.confirm=()=>true;f.failLoads(true);await w.loadChecklist();
        assert.equal(d.getElementById('saveClBtn').disabled,true);assert.ok([...d.querySelectorAll('[data-checklist-item]')].every(input=>input.disabled));
        f.failLoads(false);await w.loadChecklist();assert.equal(d.getElementById('saveClBtn').disabled,false);
        assert.equal(d.querySelector('[data-checklist-item="cl01"]').checked,true);assert.equal(d.querySelector('[data-checklist-item="cl02"]').checked,false);
    }finally{dom.window.close();}
});
