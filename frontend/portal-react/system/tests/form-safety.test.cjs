const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const listeners={},alerts=[];const field={id:'name',value:'',required:true,type:'text',disabled:false,setCustomValidity(s){this.error=s},checkValidity(){return !this.error&&!!this.value},setAttribute(){},removeAttribute(){},reportValidity(){this.reported=true},focus(){}};
 const button={innerHTML:'Save',disabled:false,setAttribute(){},removeAttribute(){}};
 const root={id:'form',tagName:'FORM',inert:false,isConnected:true,querySelectorAll(s){return s.startsWith('button')?[button]:[field]}};
 const document={getElementById:id=>id==='form'?root:null,addEventListener:(k,f)=>listeners[k]=f};
 const window={addEventListener:(k,f)=>listeners[k]=f};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/permits/form-safety.js','utf8'),{document,window,alert:m=>alerts.push(m),confirm:()=>false,queueMicrotask,console:{error(){}}});
 return {api:window.FormSafety,field,button,root,alerts,listeners};
}
test('whitespace-only required entry is rejected at its field',()=>{const f=fixture();f.field.value='   ';assert.equal(f.api.validate(f.root),false);assert.equal(f.field.reported,true);});
test('rapid submits share one lock; button and form unlock after failure',async()=>{const f=fixture();f.field.value='Visitor';let calls=0,reject;const save=f.api.guard('form',()=>{calls++;return new Promise((_,r)=>reject=r)});const first=save();await save();assert.equal(calls,1);assert.equal(f.button.disabled,true);assert.equal(f.root.inert,true);reject(Error('offline'));await first;assert.equal(f.button.disabled,false);assert.equal(f.button.innerHTML,'Save');assert.equal(f.root.inert,false);assert.equal(f.field.value,'Visitor');});
test('dirty values warn, reverting and saving remove the warning',()=>{const f=fixture();f.api.remember(f.root);f.field.value='Changed';assert.equal(f.api.dirty(),true);assert.equal(f.api.discard('form'),false);f.field.value='';assert.equal(f.api.dirty(),false);f.field.value='Changed';f.api.clean('form');assert.equal(f.api.dirty(),false);});
test('checklist changes track their state and clear only on successful save',()=>{const f=fixture();let checked=false;f.api.rememberValue('checklist',()=>String(checked));checked=true;assert.equal(f.api.dirty(),true);f.api.clean('checklist');assert.equal(f.api.dirty(),false);});
