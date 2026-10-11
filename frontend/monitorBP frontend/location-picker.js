(() => {
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    function matches(name, query) {
        const search=normalize(query).replace(/^brgy\.?\s*|^barangay\s*/, '');
        if(!search)return true;
        if(/^\d+(?:-[a-z])?$/.test(search))return new RegExp('^brgy\\.\\s*'+search+'(?:-|,|\\s|$)','i').test(name);
        return normalize(name).includes(search);
    }
    for(const input of document.querySelectorAll('[data-location-picker]')) {
        const wrapper=document.createElement('div');wrapper.className='permit-location-picker';
        input.before(wrapper);wrapper.append(input);
        const list=document.createElement('div');list.className='location-options';list.id=input.id+'-options';list.hidden=true;list.setAttribute('role','listbox');list.setAttribute('aria-label','Barangay suggestions');
        const hint=document.createElement('small');hint.className='location-hint';hint.id=input.id+'-hint';hint.textContent='Search by barangay number or name, or type your own address.';
        wrapper.append(list,hint);
        input.placeholder='Search barangay or type an address';input.autocomplete='off';
        input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.setAttribute('aria-describedby',hint.id);
        let options=[],active=-1;
        function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
        function choose(name){input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();input.focus();close();}
        function render(){
            list.replaceChildren();options=[];active=-1;input.removeAttribute('aria-activedescendant');
            const results=(window.PermitBarangays || []).filter(item=>matches(item.name,input.value));
            let group='';
            for(const item of results){
                if(item.group!==group){group=item.group;const title=document.createElement('div');title.className='location-group';title.setAttribute('role','presentation');title.textContent=group;list.append(title);}
                const option=document.createElement('div');option.id=list.id+'-'+options.length;option.className='location-option';option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.textContent=item.name;
                option.addEventListener('mousedown',event=>event.preventDefault());option.addEventListener('click',()=>choose(item.name));options.push(option);list.append(option);
            }
            if(!results.length){const empty=document.createElement('div');empty.className='location-no-match';empty.textContent='No matching barangay. Your typed address will still be saved.';list.append(empty);}
            list.hidden=false;list.scrollTop=0;input.setAttribute('aria-expanded','true');
        }
        function move(step){if(list.hidden)render();if(!options.length)return;active=(active+step+options.length)%options.length;options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});}
        input.addEventListener('focus',render);input.addEventListener('click',()=>{if(list.hidden)render();});input.addEventListener('input',render);
        input.addEventListener('keydown',event=>{
            if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}
            else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();choose(options[active].textContent);}
            else if(event.key==='Escape'&&!list.hidden){event.preventDefault();event.stopPropagation();close();}
            else if(event.key==='Tab')close();
        });
        input.addEventListener('blur',close);
        input.form?.addEventListener('reset',close);
    }
})();
