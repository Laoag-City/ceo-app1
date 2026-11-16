const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;
const { JSDOM } = require('jsdom');
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
        return {json:async()=>({records:[{actor_name:"Edward O'Brien <Engineer>",actor_role:'operator',category:'comment',message:'<img src=x onerror=alert(1)>',created_at:'2026-09-15 12:00:00'}],next:null})};
    }}};
    vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/permits/project-records.js','utf8'),context);
    let host=new Element('section');window.ProjectRecords.mount(host,'permits',10);await tick();
    assert.equal(host.children[3].children[0].children[1].textContent,'<img src=x onerror=alert(1)>');
    assert.equal(host.children[3].children[0].children[0].children[0].textContent,"Edward O'Brien <Engineer>");
    const toggle=host.children[0].children[1].children[0];
    let form=host.children[1],textarea=form.children[1];
    assert.equal(form.hidden,true);
    toggle.onclick();
    assert.equal(form.hidden,false);
    assert.equal(toggle.children[1].textContent,'Hide form');
    textarea.value='Check revised plans';textarea.events.input();
    form.children[0].children[1].onclick();
    assert.equal(form.hidden,true);
    assert.equal(toggle.children[1].textContent,'Add Remarks');
    toggle.onclick();
    assert.equal(textarea.value,'Check revised plans');
    toggle.onclick();
    assert.equal(form.hidden,true);
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

test('the remarks panel offers deletion only for own remarks and waits for confirmation and success', async t => {
    const dom = new JSDOM('<section></section>', { url: 'http://localhost/', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    let confirmation = false, attempts = 0;
    window.confirm = () => confirmation;
    window.RequestFeedback = { fetch: async (url, options) => {
        if (options.method === 'DELETE') {
            assert.equal(url, '/api/project-records/occupancy/10/comments/1');
            if (++attempts === 1) throw new Error('Please try again.');
            return {};
        }
        const records = [
            { id: 1, actor_name: 'Same display name', category: 'comment', message: 'My remark', canDelete: true },
            { id: 2, actor_name: 'Same display name', category: 'comment', message: 'Their remark', canDelete: false }
        ];
        return { json: async () => ({ records, next: null }) };
    } };
    window.eval(fs.readFileSync(__dirname+'/../assets/permits/project-records.js', 'utf8'));
    const host = window.document.querySelector('section');
    window.ProjectRecords.mount(host, 'occupancy', 10);
    await tick();
    const [own, other] = host.querySelectorAll('article');
    assert.equal(other.querySelector('button'), null);
    const button = own.querySelector('button');
    assert.equal(button.textContent, 'Delete');
    await button.onclick();
    assert.equal(attempts, 0);
    confirmation = true;
    await button.onclick();
    assert.ok(own.isConnected);
    assert.match(host.querySelector('[role=status]').textContent, /try again/);
    await button.onclick();
    assert.equal(own.isConnected, false);
    assert.ok(other.isConnected);
    assert.equal(host.querySelector('[role=status]').textContent, 'Remark deleted.');
});
