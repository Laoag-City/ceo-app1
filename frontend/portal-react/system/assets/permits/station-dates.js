/**
 * Calendar-only station dates. Matrix controls are local drafts: the Details
 * controller includes both dates in its single Save Signature Updates request.
 */
(() => {
    const fields=['date_checked','date_approved'];
    const labels={date_checked:'Date Checked',date_approved:'Date Approved'};
    const date=value=>/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0,10) : '';
    const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const summary=row=>'<small class="station-date-summary">Date Checked: '+(date(row.date_checked)||'—')+'<br>Date Approved: '+(date(row.date_approved)||'—')+'</small>';
    const escape=value=>String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const remarks=(row,label='See remarks')=>{
        const value=String(row.feedback_remarks ?? '');
        const station=escape(row.discipline_name || row.discipline || 'this station');
        return value.trim() ? '<span class="station-remarks"><button type="button" class="remarks-view-trigger" data-station-remarks data-remarks-station="'+station+'" data-remarks-text="'+escape(value)+'" aria-haspopup="dialog" aria-label="'+escape(label)+' for '+station+'">'+escape(label)+'</button></span>' : '';
    };
    const remarksLoads=new WeakMap();
    // Read saved remarks from the full project; registry aggregates omit them.
    async function loadRemarks(host,kind,project) {
        const pending={};remarksLoads.set(host,pending);
        host.querySelectorAll('.station-remarks,.station-remarks-notice').forEach(element=>element.remove());
        const notice=document.createElement('p');notice.className='station-remarks-notice';notice.setAttribute('role','status');notice.textContent='Loading station remarks…';host.prepend(notice);
        const current=()=>remarksLoads.get(host)===pending && notice.isConnected;
        try {
            const response=await RequestFeedback.fetch('/api/'+kind+'/'+Number(project));
            const data=await response.json();
            if(!response.ok || Number(data.id)!==Number(project) || !Array.isArray(data.matrix))throw Error('Station remarks are unavailable.');
            if(!current())return;
            const rows=[...data.matrix,...(data.sub_permits || []).flatMap(sub=>sub.matrix || [])];
            const byId=new Map(rows.map(row=>[Number(row.id),row]));
            for(const element of host.querySelectorAll('[data-progress-station]')) {
                const row=byId.get(Number(element.dataset.progressStation));
                if(row)element.insertAdjacentHTML('beforeend',remarks(row));
            }
            notice.remove();
        } catch(error) {
            if(current())notice.textContent='Station remarks could not be loaded. Reopen progress to try again.';
        }
    }
    const engineer=row=>'<span class="station-engineer-name" data-station-engineer="'+Number(row.id)+'" title="Last reviewer to save a station change; name follows their profile">'+escape(row.engineer_name || (row.assigned_operators?.length?'Not yet reviewed':'Unassigned'))+'</span>';
    function updateEngineers(rows,profile) {
        if(!profile || !Number.isInteger(Number(profile.userId)) || Number(profile.userId)<=0 || typeof profile.displayName!=='string' || !profile.displayName.trim())return;
        for(const row of rows)if(Number(row.assigned_operator_id)===Number(profile.userId)) {
            row.engineer_name=profile.displayName.trim();
            document.querySelectorAll('[data-station-engineer="'+Number(row.id)+'"]').forEach(element=>{element.textContent=row.engineer_name;});
        }
    }
    const cells=(kind,project,row,editing=false)=>fields.map(field=>editing
        ? '<td><input type="date" class="station-date-input" data-field="'+field+'" data-station="'+Number(row.id)+'" value="'+date(row[field])+'" max="'+today()+'" aria-label="'+labels[field]+' for station '+Number(row.id)+'"></td>'
        : '<td><span class="station-date-value">'+(date(row[field])||'—')+'</span></td>').join('');
    function read(row) {
        const inputs=fields.map(field=>row.querySelector('.station-date-input[data-field="'+field+'"]'));
        const [checked,approved]=inputs;
        if(inputs.some(input=>!input))throw Error('Station date controls are missing. Refresh the workspace.');
        inputs.forEach(input=>input.setCustomValidity(''));
        if(approved.value && (!checked.value || approved.value<checked.value))approved.setCustomValidity('Date Approved requires Date Checked and cannot be earlier.');
        for(const input of inputs)if(!input.reportValidity())return null;
        return {date_checked:checked.value,date_approved:approved.value};
    }
    const text=value=>String(value ?? '').trim();
    function changedRows(rows,originals) {
        return rows.filter(row=>{
            const old=originals.find(item=>Number(item.id)===Number(row.id));
            return !old || ['signature_status','feedback_remarks',...fields].some(key=>{
                const normalize=value=>fields.includes(key) ? date(value) : key==='signature_status' ? text(value || 'Pending') : text(value);
                return normalize(row[key])!==normalize(old[key]);
            });
        });
    }
    const hasDateChanges=(rows,originals)=>rows.some(row=>{
        const old=originals.find(item=>Number(item.id)===Number(row.id));
        return !old || fields.some(key=>date(row[key])!==date(old[key]));
    });
    window.StationDates={summary,cells,read,changedRows,hasDateChanges,engineer,updateEngineers,remarks,loadRemarks};
})();
