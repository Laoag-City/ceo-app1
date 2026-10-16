/** Shared Building / Occupancy inspections. Server records own their versions;
 * failed reads keep the last list and failed writes keep the modal draft.
 * Never automatically retry a write with an unconfirmed outcome.
 */
(() => {
    const kind=document.querySelector('[data-inspections-kind]')?.dataset.inspectionsKind;
    const permitId=new URLSearchParams(location.search).get('id');
    if(!['permits','occupancy'].includes(kind)||! /^[1-9]\d*$/.test(permitId||''))return;
    const base=`/api/${kind}/${permitId}/inspections`;
    const canManage=()=>{try{return JSON.parse(sessionStorage.getItem('oboUser')||'null')?.role==='operator';}catch{return false;}};
    const el=id=>document.getElementById(id);
    const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
    const date=value=>value?new Date(String(value).slice(0,10)+'T00:00:00Z').toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}):'—';
    const headers=version=>({'Content-Type':'application/json','x-permit-request':'1','x-record-version':version||''});
    let inspections=[],inspectionVersion='',readSequence=0,previousFocus;
    const feedback=message=>{el('inspectionFeedback').textContent=message;};
    async function loadInspections(message='') {
        const sequence=++readSequence;
        feedback('Loading inspections…');
        try {
            const response=await RequestFeedback.fetch(base);
            const data=await response.json();
            if(!response.ok||!data.success||!Array.isArray(data.inspections))throw Error(data.message||'Unable to load inspections.');
            if(sequence!==readSequence)return;
            inspections=data.inspections.filter(row=>Number.isSafeInteger(Number(row.id))&&Number(row.id)>0);
            renderInspections();feedback(message);
        } catch(error) {
            if(sequence!==readSequence)return;
            feedback('Inspections could not be refreshed. Previously loaded records are kept. Use Refresh to try again.');
            RequestFeedback.report(error);
        }
    }
    function openInspModal(id) {
        if(!canManage())return;
        if(el('inspModal').style.display==='flex'&&!FormSafety.discard('inspModal'))return;
        const row=id?inspections.find(item=>Number(item.id)===Number(id)):null;
        if(id&&!row){feedback('That inspection is no longer loaded. Refresh before editing.');return;}
        inspectionVersion=row?._version||'';
        previousFocus=document.activeElement;
        el('inspModalTitle').textContent=row?'Edit Inspection Record':'Log New Inspection';
        el('editInspId').value=row?.id||'';
        el('inspType').value=row?.inspection_type||'Preliminary';
        // Calendar dates belong to the office time zone, including before 8 AM.
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        el('inspDate').value=row?.inspection_date?.slice(0,10)||today;
        el('inspInspector').value=row?.inspector_name||'';
        el('inspResult').value=row?.result||'Scheduled';
        el('inspFindings').value=row?.findings||'';
        el('inspNextDate').value=row?.next_inspection_date?.slice(0,10)||'';
        for(const field of el('inspModal').querySelectorAll('input,select,textarea')){field.setCustomValidity('');field.removeAttribute('aria-invalid');}
        FormSafety.clean('inspModal');FormSafety.remember(el('inspModal'));
        el('inspModal').style.display='flex';el('inspType').focus();
    }
    function closeInspModal() {
        if(!FormSafety.discard('inspModal'))return;
        el('inspModal').style.display='none';previousFocus?.focus();
    }
    const saveInspection=FormSafety.guard('inspSaveBtn',async()=>{
        if(!canManage())return;
        const editId=el('editInspId').value,dateValue=el('inspDate').value,next=el('inspNextDate');
        if(next.value&&next.value<dateValue){next.setCustomValidity('The next inspection must be on or after this inspection.');next.reportValidity();return;}
        const payload={inspection_type:el('inspType').value,inspection_date:dateValue,inspector_name:el('inspInspector').value,
            result:el('inspResult').value,findings:el('inspFindings').value,next_inspection_date:next.value||null};
        try {
            const response=await RequestFeedback.fetch(editId?base+'/'+editId:base,{method:editId?'PUT':'POST',headers:headers(inspectionVersion),body:JSON.stringify(payload)});
            const data=await response.json();
            if(!response.ok||!data.success)throw Error(data.message||'Inspection could not be saved.');
            FormSafety.clean('inspModal');closeInspModal();await loadInspections(data.message||'Inspection saved.');
        } catch(error){RequestFeedback.report(error);}
    });
    function deleteInspection(id) {
        if(!canManage())return;
        return FormSafety.guard('inspection-delete-'+id,async()=>{
            const row=inspections.find(item=>Number(item.id)===Number(id));
            if(!row)return;
            if(!confirm('Request administrator approval to delete this inspection? It will remain until approved. The permit will be retained.'))return;
            try {
                const response=await RequestFeedback.fetch(base+'/'+Number(row.id),{method:'DELETE',headers:headers(row._version)});
                const data=await response.json();
                if(!response.ok||!data.success)throw Error(data.message||'Inspection deletion could not be requested.');
                if(data.pending)alert(data.message);
                await loadInspections(data.message||'Inspection deletion requested.');
            } catch(error){RequestFeedback.report(error);}
        })();
    }
    function renderInspections() {
        const count=el('tbInspection');if(count)count.textContent=inspections.length;
        el('inspSummaryBadges').innerHTML=(inspections.length?`<span class="inspection-total">${inspections.length} total</span>`:'')+
            ['Passed','Failed','Scheduled','Conditional'].map(result=>{
                const total=inspections.filter(row=>row.result===result).length;
                return total?`<span class="sbadge sb-${result.toLowerCase()}">${total} ${result}</span>`:'';
            }).join('');
        if(!inspections.length){el('inspectionList').innerHTML='<div class="insp-empty"><p>No inspections logged yet.'+(canManage()?' Use Log inspection to add one.':'')+'</p></div>';return;}
        const types={'Preliminary':'preliminary','Final':'final','Follow-up':'followup','Special':'special'};
        const results={'Passed':'passed','Failed':'failed','Scheduled':'scheduled','Conditional':'conditional'};
        el('inspectionList').innerHTML=inspections.map(row=>`
            <article class="insp-card">
                <div class="insp-card-head"><div class="insp-card-title"><span class="type-badge tb-${types[row.inspection_type]||'preliminary'}">${escape(row.inspection_type)}</span><span class="insp-date">${escape(date(row.inspection_date))}</span></div><span class="result-badge rb-${results[row.result]||'scheduled'}">${escape(row.result)}</span></div>
                <div class="insp-card-body"><div class="insp-meta-grid">
                    <div class="insp-meta-item"><div class="iml">Inspector</div><div class="imv">${escape(row.inspector_name||'—')}</div></div>
                    <div class="insp-meta-item"><div class="iml">Type</div><div class="imv">${escape(row.inspection_type)}</div></div>
                    ${row.next_inspection_date?`<div class="insp-meta-item"><div class="iml">Next Inspection</div><div class="imv">${escape(date(row.next_inspection_date))}</div></div>`:''}
                </div>${row.findings?`<div class="insp-findings-section"><p class="insp-findings-label">Findings / remarks</p><div class="insp-findings">${escape(row.findings)}</div></div>`:''}</div>
                ${canManage()?`<div class="insp-card-footer"><button type="button" class="insp-action" onclick="openInspModal(${Number(row.id)})">Edit</button><button type="button" class="insp-action insp-action-danger" onclick="deleteInspection(${Number(row.id)})" title="Request inspection deletion">Delete</button></div>`:''}
            </article>`).join('');
    }
    document.addEventListener('keydown',event=>{
        if(el('inspModal').style.display!=='flex')return;
        if(event.key==='Escape'){event.preventDefault();closeInspModal();}
        if(event.key==='Tab'){
            const targets=[...el('inspModal').querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(node=>!node.disabled);
            const first=targets[0],last=targets.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
    });
    Object.assign(window,{loadInspections,openInspModal,closeInspModal,saveInspection,deleteInspection});
})();
