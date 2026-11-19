import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const contacts=readFileSync(new URL('../assets/permits/permit-contacts.js',import.meta.url),'utf8');
const safety=readFileSync(new URL('../assets/permits/form-safety.js',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const [page,ids] of [['permits-index',['phone_number','email']],['permits-occupancy',['f_phone','f_email']]])test(page+': create form exposes optional phone/email with proper types and limits',()=>{
 const dom=new JSDOM('<div id="system-react-root" data-page="'+page+'"></div>',{url:'http://localhost:3000',runScripts:'outside-only'});
 try{const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.eval(bundle);
 for(const [i,id]of ids.entries()){const input=w.document.getElementById(id);assert.ok(input,id);assert.equal(input.required,false);assert.equal(input.type,i?'email':'tel');assert.equal(input.maxLength,i?255:50);}
 }finally{dom.window.close()}
});
function fixture(kind='permits',role='operator',fetch){
 const anchor=kind==='permits'?'permitMetaDetails':'profileOwner';
 const dom=new JSDOM('<div class="card"><div id="'+anchor+'"></div></div>',{url:'http://localhost:3000/edit',runScripts:'outside-only'});
 const w=dom.window,calls=[],saved=[];w.sessionStorage.setItem('oboUser',JSON.stringify({id:7,role}));
 w.RequestFeedback={fetch:async(url,options)=>{calls.push({url,...options});return fetch?await fetch():{ok:true,json:async()=>({success:true,contacts:JSON.parse(options.body),_version:'saved-version-'+calls.length,message:'Contact details saved.'})}}};
 w.eval(safety);w.eval(contacts);
 const record={id:10,_version:'loaded-version',phone_number:'09123456789',email:'client@example.com'};
 w.PermitContacts.render(record,kind,current=>saved.push({...current}));
 return {dom,w,calls,saved,record,doc:w.document,form:w.document.getElementById('permitContactsForm')};
}
for(const kind of ['permits','occupancy'])test(kind+': corrections save immediately and synchronize the loaded version',async()=>{
 const f=fixture(kind);try{
 f.form.elements.phone_number.value='09987654321';f.form.elements.email.value='corrected@example.com';
 f.form.requestSubmit();f.form.requestSubmit();await tick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'/api/'+kind+'/10/contacts');
 assert.equal(f.calls[0].headers['x-record-version'],'loaded-version');
 assert.deepEqual(JSON.parse(f.calls[0].body),{phone_number:'09987654321',email:'corrected@example.com'});
 assert.equal(f.doc.querySelector('[role=status]').textContent,'Contact details saved.');
 assert.equal(f.doc.querySelector('details').open,false);
 assert.ok(f.doc.querySelector('dl').textContent.includes('corrected@example.com'));
 assert.equal(f.record._version,'saved-version-1');assert.equal(f.saved[0]._version,'saved-version-1');
 f.form.elements.email.value='second@example.com';f.form.requestSubmit();await tick();
 assert.equal(f.calls[1].headers['x-record-version'],'saved-version-1');
 assert.ok(f.doc.querySelector('dl').textContent.includes('second@example.com'));
 assert.equal(f.record._version,'saved-version-2');
 }finally{f.dom.window.close()}
});
test('both contacts can be cleared and keep plain labels without optional text',async()=>{
 const f=fixture();try{
 for(const input of f.form.querySelectorAll('input')){input.value='';assert.equal(input.required,false);}
 assert.deepEqual([...f.form.querySelectorAll('label')].map(label=>label.firstChild.textContent),['Phone number','Email']);
 assert.doesNotMatch(f.form.textContent,/optional/i);
 f.form.requestSubmit();await tick();
 assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0].body),{phone_number:'',email:''});
 assert.deepEqual([...f.doc.querySelectorAll('dd')].map(node=>node.textContent),['—','—']);
 }finally{f.dom.window.close()}
});
test('contact submission errors preserve the draft and allow retry',async()=>{
 const f=fixture('occupancy','operator',async()=>({ok:false,json:async()=>({success:false,message:'This permit changed. Refresh before retrying.'})}));
 try{f.form.elements.email.value='draft@example.com';f.form.requestSubmit();await tick();
 assert.match(f.doc.querySelector('[role=status]').textContent,/Refresh/);assert.equal(f.form.elements.email.value,'draft@example.com');assert.equal(f.form.querySelector('button').disabled,false);
 }finally{f.dom.window.close()}
});
test('admins read contacts and personal data is always rendered as text',()=>{
 const f=fixture('permits','admin');try{
 assert.equal(f.form,null);assert.ok(f.doc.querySelector('dl').textContent.includes('client@example.com'));
 f.w.PermitContacts.render({id:10,email:'<img src=x onerror=alert(1)>'},'permits');
 assert.equal(f.doc.querySelector('img'),null);assert.match(f.doc.querySelector('dl').textContent,/<img/);
 }finally{f.dom.window.close()}
});
