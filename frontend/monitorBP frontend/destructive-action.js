/* One confirmation at a time; actions run only after explicit confirmation. */
(() => {
 let active=false;
 function run(options){
  if(active)return Promise.resolve(false);active=true;
  return new Promise(resolve=>{
   let busy=false;const previous=document.activeElement;
   const dialog=document.createElement('dialog');dialog.className='danger-confirm';dialog.setAttribute('aria-labelledby','dangerConfirmTitle');dialog.setAttribute('aria-describedby','dangerConfirmDescription');
   const title=document.createElement('h2');title.id='dangerConfirmTitle';title.textContent=options.title;
   const message=document.createElement('p');message.id='dangerConfirmDescription';message.textContent=options.message;
   const error=document.createElement('p');error.className='danger-confirm-error';error.setAttribute('role','alert');
   const buttons=document.createElement('div');buttons.className='danger-confirm-actions';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.autofocus=true;
   const accept=document.createElement('button');accept.type='button';accept.className='danger-confirm-accept';accept.textContent=options.confirmLabel||'Confirm';
   let input;
   dialog.append(title,message);
   if(options.requireText){const label=document.createElement('label');label.textContent='Type '+options.requireText+' to confirm';input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;label.append(input);dialog.append(label);accept.disabled=true;input.addEventListener('input',()=>{accept.disabled=busy||input.value!==options.requireText;});}
   const finish=result=>{dialog.close();dialog.remove();active=false;previous?.focus();resolve(result);};
   cancel.onclick=()=>{if(!busy)finish(false);};
   dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)finish(false);});
   accept.onclick=async()=>{
    if(busy||options.requireText&&input.value!==options.requireText)return;
    busy=true;accept.disabled=true;cancel.disabled=true;if(input)input.disabled=true;accept.textContent='Processing…';error.textContent='';dialog.setAttribute('aria-busy','true');
    try{const result=await options.action();if(result===false)throw new Error('The action was not completed. Cancel to review the error message and current records before trying again.');finish(true);}
    catch(e){error.textContent=e.message||'The action could not be completed. Your confirmation has not been treated as a success.';}
    finally{busy=false;accept.disabled=!!options.requireText&&input.value!==options.requireText;cancel.disabled=false;if(input)input.disabled=false;accept.textContent=options.confirmLabel||'Confirm';dialog.removeAttribute('aria-busy');}
   };
   buttons.append(cancel,accept);dialog.append(error,buttons);document.body.append(dialog);dialog.showModal();cancel.focus();
  });
 }
 window.DestructiveAction={run};
})();
