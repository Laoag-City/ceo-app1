/**
 * MAINTAINER GUIDE
 * Client-side form validation, submission locking, and unsaved-change prompts.
 * Controllers wrap submit handlers with guard and mark saved forms clean. These usability checks supplement server validation, never replace it.
 */
/* Shared, explicit guards for data-entry forms. */
(() => {
 const busy=new Set(), tracked=new Map(), virtual=new Map();
 const regionFor=el=>el.closest('form:not(#loginForm), #matrixTableBody, #inspModal, #remarksModalOverlay, #remarksModal');
 const value=el=>el.type==='checkbox'||el.type==='radio'?el.checked:el.value;
 const snapshot=root=>JSON.stringify([...root.querySelectorAll('input,select,textarea')].map(el=>[el.id||el.name,value(el)]));
 function remember(root){if(root&&!tracked.has(root))tracked.set(root,snapshot(root));}
 function clean(id){const root=document.getElementById(id);if(root)tracked.delete(root);virtual.delete(id);}
 function dirty(id){return [...virtual].some(([key,state])=>(!id||key===id)&&state.read()!==state.old)||[...tracked].some(([root,old])=>(!id||root.id===id)&&root.isConnected&&snapshot(root)!==old);}
 function discard(id){if((busy.has(id)||id==='matrixTableBody'&&busy.has('saveMatrixBtn')||id==='inspModal'&&busy.has('inspSaveBtn'))&&dirty(id)){alert('Please wait for the current submission to finish.');return false;}if(dirty(id)&&!confirm('Discard your unsaved changes?'))return false;clean(id);return true;}
 function validate(root){
  if(!root)return true;
  let first=null;
  for(const el of root.querySelectorAll('input,select,textarea')){
   if(el.disabled||el.type==='hidden')continue;
   el.setCustomValidity('');
   if(el.required&&typeof el.value==='string'&&!el.value.trim())el.setCustomValidity('Please enter a value; spaces alone are not valid.');
   if(el.type==='tel'&&el.value.trim()&&(!/^[+()0-9 .-]{7,50}$/.test(el.value.trim())||(el.value.match(/\d/g)||[]).length<7))el.setCustomValidity('Enter a phone number using digits and optional +, spaces, or dashes.');
   if(!el.checkValidity()){el.setAttribute('aria-invalid','true');first ||= el;}else el.removeAttribute('aria-invalid');
  }
  if(first){first.reportValidity();first.focus();return false;}return true;
 }
 function guard(id,handler){return async function(event){
  event?.preventDefault();if(busy.has(id))return;
  const target=document.getElementById(id),root=target?.tagName==='FORM'?target:(id==='saveMatrixBtn'?document.getElementById('matrixTableBody'):id==='inspSaveBtn'?document.getElementById('inspModal'):id==='saveClBtn'?document.getElementById('checklistContainer'):null);
  if(!validate(root))return;
  busy.add(id);
  const buttons=target?.tagName==='FORM'?[...target.querySelectorAll('button[type=submit],button:not([type])')]:target?[target]:[];
  const priorInert=root?.inert;
  const old=buttons.map(b=>[b,b.innerHTML,b.disabled]);
  buttons.forEach(b=>{b.disabled=true;b.textContent='Submitting…';b.setAttribute('aria-busy','true');});
  try{const pending=handler.call(this,event);if(root)root.inert=true;return await pending;}catch(error){console.error(error);if(window.RequestFeedback)window.RequestFeedback.report(error);else alert('Submission could not be confirmed. Your entries are kept. Check the record before retrying.');}
  finally{busy.delete(id);if(root)root.inert=priorInert;old.forEach(([b,html,disabled])=>{b.innerHTML=html;b.disabled=disabled;b.removeAttribute('aria-busy');});}
 };}
 for(const event of ['focusin','pointerdown','beforeinput','dragenter'])document.addEventListener(event,e=>remember(regionFor(e.target)),true);
 document.addEventListener('input',e=>{if(e.target.setCustomValidity){e.target.setCustomValidity('');e.target.removeAttribute('aria-invalid');}});
 document.addEventListener('submit',e=>{if(!validate(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('reset',e=>{queueMicrotask(()=>clean(e.target.id));},true);
 window.addEventListener('beforeunload',e=>{if(dirty()||busy.size){e.preventDefault();e.returnValue='';}});
 function rememberValue(id,read){if(!virtual.has(id))virtual.set(id,{read,old:read()});}
 function leave(){if(busy.size){alert('Please wait for submission to finish.');return false;}if(dirty()&&!confirm('Leave and discard your unsaved changes?'))return false;tracked.clear();virtual.clear();return true;}
 window.FormSafety={leave,rememberValue,guard,validate,clean,dirty,discard,remember};
})();
