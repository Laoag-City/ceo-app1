/* Independent checklist version and draft: switching tabs never reloads it. */
(() => {
  const start=()=>{
    const container=document.getElementById('checklistContainer');
    if(!document.querySelector('.building-requirements')||!container)return;
    const id=new URLSearchParams(location.search).get('id');
    if(!/^[1-9]\d*$/.test(id||''))return;
    const groups=[...window.BuildingRequirements.sections,{section:'Procedure',procedure:true,items:window.BuildingRequirements.procedure}],items=groups.flatMap(group=>group.items);
    const save=document.getElementById('saveClBtn'),reload=document.getElementById('reloadBuildingChecklist'),feedback=document.getElementById('buildingChecklistFeedback');
    const canManage=()=>{try{return JSON.parse(sessionStorage.getItem('oboUser')||'null')?.role==='operator';}catch{return false;}};
    save.hidden=!canManage();
    let state={},version='',loading=false,saving=false,ready=false;
    const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
    function progress(){
      const count=items.filter(item=>state[item.id]===true).length;
      const pct=Math.round(count/items.length*100);
      document.getElementById('tbChecklist').textContent=count+'/'+items.length;
      document.getElementById('clProgressLabel').textContent=count+' of '+items.length+' items completed';
      document.getElementById('clProgressBar').style.width=pct+'%';
      document.getElementById('ringPct').textContent=pct+'%';
      document.getElementById('ringFill').style.strokeDashoffset=131.95-(131.95*pct/100);
      document.querySelector('.permit-checklist-progress').setAttribute('aria-valuenow',pct);
      const side=document.getElementById('checklistSideCard');side.style.display='block';
      document.getElementById('sideClPct').textContent=pct+'%';document.getElementById('sideClBar').style.width=pct+'%';
      document.getElementById('sideClCount').textContent=count+' of '+items.length+' items';
      document.getElementById('sideClStatus').textContent=pct===100?'Checklist complete':count?'In progress':'Not started';
      side.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',pct);
      groups.forEach((group,index)=>{const received=group.items.filter(item=>state[item.id]===true).length;const counter=container.querySelector('[data-group="'+index+'"]');if(counter)counter.textContent=received+'/'+group.items.length;});
    }
    function render(){
      container.replaceChildren();
      groups.forEach((group,index)=>{
        const section=node('section'),heading=node('div'),counter=node('span');section.className='cl-section';heading.className='cl-section-title';
        if(group.procedure)section.id='buildingProcedure';
        counter.className='cl-section-count';counter.dataset.group=index;heading.append(node('h3',group.section),counter);section.append(heading);
        for(const item of group.items){
          const label=node('label'),input=node('input'),copy=node('span'),title=node('span',item.number+'. '+item.title),badge=node('span',item.req?'Required':'If applicable');label.className='cl-item';
          input.type='checkbox';input.className='cl-checkbox';input.checked=state[item.id]===true;input.disabled=!ready||!canManage();input.dataset.requirement=item.id;
          label.classList.toggle('checked',input.checked);copy.className='cl-content';title.className='cl-title';copy.append(title);
          if(item.note){const note=node('span',item.note);note.className='cl-note';copy.append(note);}
          badge.className='cl-tag '+(item.req?'tag-req':'tag-condition');
          input.addEventListener('change',()=>{
            if(!canManage())return;
            FormSafety.rememberValue('checklistContainer',()=>JSON.stringify(state));
            state={...state,[item.id]:input.checked};label.classList.toggle('checked',input.checked);progress();feedback.textContent='Unsaved checklist changes.';
          });
          label.append(input,copy,badge);section.append(label);
        }container.append(section);
      });progress();
    }
    async function load(){
      if(loading||saving)return;
      if(!FormSafety.discard('checklistContainer'))return;
      loading=true;ready=false;save.disabled=reload.disabled=true;container.inert=true;feedback.textContent='Loading saved checklist…';
      try{
        const response=await RequestFeedback.fetch('/api/permits/'+id+'/checklist',{credentials:'same-origin',cache:'no-store'});
        const data=await response.json();
        if(!data._version||!data.checklist_state||Array.isArray(data.checklist_state)||typeof data.checklist_state!=='object')throw new Error('The saved checklist could not be read. Please refresh it.');
        state=data.checklist_state;version=data._version;ready=true;FormSafety.clean('checklistContainer');render();feedback.textContent='Saved checklist loaded.';
      }catch(error){feedback.textContent='Unable to load saved requirements. Refresh the checklist to try again.';RequestFeedback.report(error);}
      finally{loading=false;container.inert=false;container.querySelectorAll('input').forEach(input=>input.disabled=!ready||!canManage());save.disabled=!ready||!canManage();reload.disabled=false;}
    }
    const submit=FormSafety.guard('saveClBtn',async()=>{
      if(!canManage()||!ready||loading||saving)return;saving=true;reload.disabled=true;
      try{
        const response=await RequestFeedback.fetch('/api/permits/'+id+'/checklist',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','x-permit-request':'1','x-record-version':version},body:JSON.stringify({checklist_state:state})});
        const data=await response.json();if(!data._version)throw new Error('Save could not be confirmed. Refresh saved data before trying again.');
        version=data._version;FormSafety.clean('checklistContainer');feedback.textContent='Checklist saved.';
      }catch(error){feedback.textContent='Checklist was not confirmed saved. Your changes are kept; copy them before refreshing.';RequestFeedback.report(error);}
      finally{saving=false;reload.disabled=false;}
    });
    save.addEventListener('click',submit);reload.addEventListener('click',load);render();load();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
