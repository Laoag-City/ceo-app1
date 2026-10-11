const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const bundle=fs.readFileSync(path.resolve(__dirname,'../../system-dist/app.js'),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,70));
test('dashboard displays real counts, safe request text, shortcuts and recoverable errors',async()=>{
    const dom=new JSDOM('<div id="system-react-root" data-page="permits-superadmin"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
    const w=dom.window,d=w.document;let fail=false,scrolled;
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
    w.HTMLElement.prototype.scrollIntoView=function(){scrolled=this};
    w.sessionStorage.setItem('oboUser',JSON.stringify({id:5,role:'admin'}));
    w.fetch=async url=>url==='/api/admin/overview'?{ok:!fail,json:async()=>fail?{message:'Please retry.'}:{totals:{building:15,occupancy:7,buildingPending:2,occupancyPending:3,buildingDeletions:1,occupancyDeletions:0},recent:[{id:1,kind:'permits',project_title:'<img src=x>',status:'pending',change_type:'permit_update',created_at:'2026-09-27T00:00:00Z'}]}}:{ok:true,json:async()=>({profile:{id:5,role:'admin',username:'Admin'}})};
    try{
        w.eval(bundle);await wait();await wait();
        assert.deepEqual([...d.querySelectorAll('.ao-stats strong')].map(el=>el.textContent),['15','7','5','1']);
        assert.equal(d.querySelector('.ao-recent img'),null);assert.equal(d.querySelector('.ao-directory'),null);
        assert.ok([...d.querySelectorAll('.ao-queue')].every(button=>!button.textContent.includes('→')));
        d.querySelector('.ao-queue').click();assert.equal(scrolled,d.querySelector('.building-review'));
        fail=true;d.querySelector('.ao-refresh button').click();await wait();assert.match(d.querySelector('.ao-error').textContent,/retry/);assert.equal(d.querySelector('.ao-stats'),null);
        fail=false;d.querySelector('.ao-refresh button').click();await wait();assert.ok(d.querySelector('.ao-stats'));
    }finally{dom.window.close()}
});
