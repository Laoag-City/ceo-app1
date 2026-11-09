/* Advisory duplicate review shared by creation, metadata edits and approvals. */
(() => {
 const memory=new Map();
 const storageKey=kind=>{let user;try{user=JSON.parse(sessionStorage.getItem('oboUser')||'null')}catch{}return 'permitCreation:'+String(user?.id||'signed-out')+':'+kind;};
 function creationKey(kind) {
  const key=storageKey(kind);let id=memory.get(key);
  try{id=sessionStorage.getItem(key)||id;}catch{}
  if(!id){id=crypto.randomUUID();memory.set(key,id);try{sessionStorage.setItem(key,id)}catch{}}
  memory.set(key,id);
  return id;
 }
 function complete(kind){const key=storageKey(kind);memory.delete(key);try{sessionStorage.removeItem(key)}catch{}}
 const style=document.createElement('link');style.rel='stylesheet';style.href='/permit-duplicates.css';document.head.append(style);
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 let queue=Promise.resolve();
 function show(warning) {
  return new Promise(resolve=>{
   const focus=document.activeElement,dialog=node('dialog',undefined,'permit-duplicate-dialog');
   dialog.id='permitDuplicateDialog';dialog.setAttribute('aria-labelledby','permitDuplicateTitle');dialog.setAttribute('aria-describedby','permitDuplicateDescription');
   const heading=node('div',undefined,'permit-duplicate-heading');
   heading.append(node('span','Check existing records','permit-duplicate-kicker'),Object.assign(node('h2','Possible duplicate permits'),{id:'permitDuplicateTitle'}),Object.assign(node('p','Review these matches before saving. Your form entries have been kept.'),{id:'permitDuplicateDescription'}));
   const list=node('ul',undefined,'permit-duplicate-list');
   for(const match of warning.matches||[]) {
    const item=node('li'),title=node('strong',match.reference+' · '+match.project_title),detail=node('p',[match.owner_name,match.location].filter(Boolean).join(' · ')),reasons=node('p',(match.reasons||[]).join(' · '),'permit-duplicate-reasons');
    item.append(title,detail,reasons);
    if(Number.isSafeInteger(match.id)&&match.id>0){const link=node('a','Open existing permit ↗');link.href=(warning.kind==='occupancy'?'/occupancy/edit?id=':'/edit?id=')+match.id;link.target='_blank';link.rel='noopener';item.append(link);}
    list.append(item);
   }
   const body=node('div',undefined,'permit-duplicate-body');body.append(list);
   if(warning.total>(warning.matches||[]).length)body.append(node('p','Showing '+warning.matches.length+' of '+warning.total+' possible matches.'));
   const label=node('label',undefined,'permit-duplicate-ack'),check=node('input');check.type='checkbox';check.id='permitDuplicateAcknowledgement';label.append(check,node('span','I reviewed the matches and want to save this application anyway.'));body.append(label);
   const actions=node('div',undefined,'permit-duplicate-actions'),cancel=node('button','Return to form'),save=node('button','Save anyway','permit-duplicate-continue');cancel.type=save.type='button';save.disabled=true;
   actions.append(cancel,save);dialog.append(heading,body,actions);document.body.append(dialog);
   let settled=false;
   function done(accepted){if(settled)return;settled=true;dialog.close();dialog.remove();if(focus?.isConnected)focus.focus();resolve(accepted);}
   check.addEventListener('change',()=>{save.disabled=!check.checked;});
   cancel.addEventListener('click',()=>done(false));save.addEventListener('click',()=>{if(check.checked)done(true)});
   dialog.addEventListener('cancel',event=>{event.preventDefault();done(false)});
   dialog.showModal();cancel.focus();
  });
 }
 function confirm(warning){const next=queue.then(()=>show(warning));queue=next.catch(()=>{});return next;}
 window.PermitDuplicates={creationKey,complete,confirm};
})();
