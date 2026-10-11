const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;
class Element {
    constructor(tag) { this.tag=tag;this.children=[];this.events={};this.dataset={};this.classList={add(){}};this.isConnected=true;this.value='';this.textContent=''; }
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(){}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){}
    setCustomValidity(message){this.invalid=message;}
    reportValidity(){return !this.children.some(child=>child.invalid);}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('comments render as text, drafts survive remount, repeated clicks post once',async()=>{
    const storage=new Map();let posts=0,finish;
    const window={};
    const context={window,crypto,document:{createElement:tag=>new Element(tag),addEventListener(){}},sessionStorage:{getItem:key=>key==='oboUser'?'{"id":1,"role":"operator"}':storage.get(key),setItem:(key,value)=>storage.set(key,value)},RequestFeedback:{fetch:async(url,options)=>{
        if(options.method==='POST'){posts++;await new Promise(resolve=>finish=resolve);return {json:async()=>({success:true})};}
        return {json:async()=>({records:[{actor_name:'Other operator',actor_role:'operator',category:'comment',message:'<img src=x onerror=alert(1)>',created_at:'2026-09-15 12:00:00'}],next:null})};
    }}};
    vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/permits/project-records.js','utf8'),context);
    let host=new Element('section');window.ProjectRecords.mount(host,'permits',10);await tick();
    assert.equal(host.children[3].children[0].children[1].textContent,'<img src=x onerror=alert(1)>');
    let form=host.children[1],textarea=form.children[1];textarea.value='Check revised plans';textarea.events.input();
    host=new Element('section');window.ProjectRecords.mount(host,'permits',10);await tick();
    form=host.children[1];textarea=form.children[1];assert.equal(textarea.value,'Check revised plans');
    const event={preventDefault(){}};const pending=form.events.submit(event);await tick();await form.events.submit(event);assert.equal(posts,1);
    finish();await pending;assert.equal(textarea.value,'');assert.deepEqual(JSON.parse(storage.get('projectComment:1:permits:10')),{});
});
test('all four pages integrate records and retain parseable scripts',()=>{
    for(const file of ['index.html','occupancy.html','edit.html','occupancy_edit.html']){
        const html=fs.readFileSync(require('node:path').resolve(__dirname, '../features/' + ({'index.html':'building/registry','edit.html':'building/details','occupancy.html':'occupancy/registry','occupancy_edit.html':'occupancy/details'}[file]) + '.html'),'utf8');
        assert.equal((html.match(/src="\/project-records.js"/g)||[]).length,1);
        for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
        if(file.includes('edit')) {
            const layout=html.includes('system-react-root')
                ? fs.readFileSync(require('node:path').resolve(__dirname, '../features/' + ({'index.html':'building/registry','edit.html':'building/details','occupancy.html':'occupancy/registry','occupancy_edit.html':'occupancy/details'}[file]) + '.jsx'),'utf8')
                : html;
            assert.match(layout,/data-project-records=(?:\{)?"(?:permits|occupancy)"/);
        }
        else assert.match(html,/ProjectRecords.mount\(recordsHost/);
    }
});
