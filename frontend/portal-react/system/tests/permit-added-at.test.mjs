import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../assets/permits/permit-added-at.js',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8');
function fixture(fetch=async()=>({ok:true,json:async()=>({success:true,created_at:'2026-11-18T16:30:00Z'})})){
 const dom=new JSDOM('<time id="permitAddedAt"></time>',{url:'http://localhost:3000',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.RequestFeedback={fetch:async url=>{calls.push(url);return fetch(url);}};w.eval(source);
 return {dom,w,calls,node:w.document.getElementById('permitAddedAt')};
}
test('the displayed system-added date uses Manila time rather than the filing date',async()=>{
 const f=fixture();try{await f.w.PermitAddedAt.load({id:1,created_at:'2026-11-18T16:30:00Z',permit_date:'2020-01-01'},'permits');
 assert.equal(f.node.textContent,'11/19/2026');assert.equal(f.node.dateTime,'2026-11-18T16:30:00.000Z');assert.match(f.node.title,/Asia\/Manila/);assert.equal(f.calls.length,0);
 }finally{f.dom.window.close();}
});
test('occupancy loads a recorded date from the protected metadata endpoint',async()=>{
 const f=fixture();try{await f.w.PermitAddedAt.load({id:14,date_applied:'2020-01-01'},'occupancy');
 assert.deepEqual(f.calls,['/api/project-added-at/occupancy/14']);assert.equal(f.node.textContent,'11/19/2026');
 }finally{f.dom.window.close();}
});
test('unknown historical dates and failed requests never become today or Date Filed',async()=>{
 let fail=false;const f=fixture(async()=>{if(fail)throw Error('Offline');return {ok:true,json:async()=>({success:true,created_at:null})};});
 try{await f.w.PermitAddedAt.load({id:1,permit_date:'2020-01-01'},'permits');assert.equal(f.node.textContent,'Not recorded');assert.equal(f.node.hasAttribute('datetime'),false);
 fail=true;await f.w.PermitAddedAt.load({id:1},'permits');assert.equal(f.node.textContent,'Unavailable');
 }finally{f.dom.window.close();}
});
for(const page of ['permits-edit','permits-occupancy_edit'])test(page+': system-added date sits beside the existing details heading',()=>{
 const dom=new JSDOM('<div id="system-react-root" data-page="'+page+'"></div>',{url:'http://localhost:3000',runScripts:'outside-only'});
 try{const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.eval(bundle);
 const node=w.document.getElementById('permitAddedAt'),header=node?.closest('.card-header');assert.ok(header);assert.equal(header.querySelector('strong').textContent,'Added to system');assert.ok(header.querySelector('h2'));
 }finally{dom.window.close();}
});
