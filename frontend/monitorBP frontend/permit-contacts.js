/* Operators save contact details directly; technical reviews remain unchanged. */
(() => {
    function render(record, kind, onSaved) {
        const anchor=document.getElementById(kind==='permits'?'permitMetaDetails':'profileOwner');
        const card=anchor?.closest('.card');
        if(!card)return;
        let mount=card.querySelector('.permit-contacts');
        if(!mount){mount=document.createElement('section');mount.className='permit-contacts';card.append(mount);}
        mount.replaceChildren();
        const title=document.createElement('h3');title.textContent='Contact details';mount.append(title);
        const details=document.createElement('dl');mount.append(details);
        const displayed={};
        for(const [key,label] of [['phone_number','Phone number'],['email','Email']]) {
            const term=document.createElement('dt'),value=document.createElement('dd');
            term.textContent=label;value.textContent=record[key] || '—';details.append(term,value);displayed[key]=value;
        }
        let user;try{user=JSON.parse(sessionStorage.getItem('oboUser')||'null');}catch{}
        if(user?.role!=='operator')return;
        const editor=document.createElement('details'),toggle=document.createElement('summary');
        toggle.textContent='Edit contact details';editor.append(toggle);mount.append(editor);
        const form=document.createElement('form');form.id='permitContactsForm';editor.append(form);
        for(const [key,label,type,max] of [['phone_number','Phone number','tel',50],['email','Email','email',255]]) {
            const field=document.createElement('label'),input=document.createElement('input');
            field.textContent=label;input.name=key;input.type=type;input.maxLength=max;
            input.value=record[key] || '';input.autocomplete=type;field.append(input);form.append(field);
        }
        const save=document.createElement('button');save.type='submit';save.className='btn btn-primary';save.textContent='Save contact details';form.append(save);
        const feedback=document.createElement('p');feedback.setAttribute('role','status');mount.append(feedback);
        form.addEventListener('submit',FormSafety.guard(form.id,async()=>{
            feedback.textContent='';
            try {
                const response=await RequestFeedback.fetch(`/api/${kind}/${record.id}/contacts`,{
                    method:'PUT',headers:{'Content-Type':'application/json','x-record-version':record._version || ''},
                    body:JSON.stringify(Object.fromEntries(new FormData(form)))
                });
                const result=await response.json();
                if(!response.ok || !result.success)throw new Error(result.message || 'Contact details could not be saved.');
                Object.assign(record,result.contacts,{_version:result._version});
                for(const key of ['phone_number','email']){
                    displayed[key].textContent=record[key] || '—';form.elements[key].value=record[key] || '';
                }
                onSaved?.(record);
                feedback.textContent=result.message;
                FormSafety.clean(form.id);editor.open=false;
            } catch(error){feedback.textContent=error.message || 'Unable to save contact details. Please try again.';}
        }));
    }
    window.PermitContacts={render};
})();
