const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
async function mount(page,handler) {
    const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
    const w=dom.window;w.TextDecoder=TextDecoder;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
    w.sessionStorage.setItem('oboUser',JSON.stringify({id:12,role:page==='permits-superadmin'?'admin':'operator'}));
    w.fetch=async(url,options)=>{
        if(url.startsWith('/api/permit-transfer'))return handler(url,JSON.parse(options.body),options);
        return {ok:true,json:async()=>({profile:{id:12,role:'admin',username:'Test'}})};
    };
    w.eval(bundle);await wait();return {dom,w,d:w.document};
}
function button(d,text){return [...d.querySelectorAll('button')].find(b=>b.textContent===text)}
test('both registries export the complete filtered IDs, and no import control',async()=>{
    for(const page of ['permits-index','permits-occupancy']) {
        let sent;
        const {dom,w,d}=await mount(page,async(url,body,options)=>{sent={url,body,options};return {ok:true,blob:async()=>new w.Blob(['csv'])}});
        try {
            w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
            w.permitExportIds=()=>Array.from({length:25},(_,i)=>i+1);
            button(d,'Export CSV').click();await wait();
            assert.equal(sent.body.ids.length,25);assert.match(sent.url,new RegExp(page==='permits-index'?'/permits/export':'/occupancy/export'));
            assert.equal(sent.options.headers['x-permit-request'],'1');assert.equal(button(d,'Import permits'),undefined);
            let downloaded;
            w.HTMLAnchorElement.prototype.click=function(){downloaded=this.download};
            button(d,'Export Excel (.xlsx)').click();await wait();
            assert.equal(sent.body.format,'xlsx');assert.equal(sent.body.ids.length,25);assert.match(downloaded,/\.xlsx$/);
        }finally{dom.window.close()}
    }
});
test('admin preview renders safe text and retries exactly the same batch after lost response',async()=>{
    const submissions=[];
    const {dom,w,d}=await mount('permits-superadmin',async(url,body)=>{
        if(url.endsWith('/preview'))return {ok:true,json:async()=>({valid:true,version:'v1',rows:[{row:2,data:{project_title:'<img src=x onerror=alert(1)>',owner_name:'Owner',location:'Place',permit_date:'2026-09-26',designer_name:'Designer',lot_numbers:'Lot 1'},errors:[],duplicates:[]}]})};
        submissions.push(body);if(submissions.length===1)throw new Error('Network interrupted');
        return {ok:true,json:async()=>({ids:[22],replayed:true})};
    });
    try {
        button(d,'Import permits').click();await wait();assert.equal(d.querySelector('.permit-transfer-dialog').open,true);
        const input=d.querySelector('.permit-transfer-dialog input[type=file]');
        Object.defineProperty(input,'files',{value:[{name:'test.csv',size:10,arrayBuffer:async()=>new TextEncoder().encode('test csv').buffer}]});
        input.dispatchEvent(new w.Event('change',{bubbles:true}));await wait();
        button(d,'Preview import').click();await wait();assert.equal(d.querySelector('.permit-transfer-preview img'),null);
        button(d,'Confirm import (1)').click();await wait();assert.match(d.querySelector('[role=status]').textContent,/Network/);
        assert.equal(input.disabled,true);button(d,'Retry same import').click();await wait();
        assert.deepEqual(submissions[0],submissions[1]);assert.match(d.querySelector('.permit-transfer-message').textContent,/BP-22/);
        d.querySelector('[aria-label="Close import"]').click();await wait();assert.equal(d.body.style.overflow,'');
    }finally{dom.window.close()}
});
