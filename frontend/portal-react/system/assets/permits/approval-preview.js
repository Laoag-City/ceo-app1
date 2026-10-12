function approvalEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function renderApprovalChanges(request, { compact = false } = {}) {
    if (request.change_type === 'delete') return '<p class="approval-delete-note">Permanently delete this permit and all related records.</p>';
    let changes;
    try { changes = typeof request.changes === 'string' ? JSON.parse(request.changes) : request.changes; } catch { return '<p>Unable to read this request. Do not approve it; ask the operator to resubmit.</p>'; }
    if (!changes || typeof changes !== 'object') return '<p>No submitted details available.</p>';
    if (request.change_type === 'bulk_delete') {
        const projects = Array.isArray(changes.projects) ? changes.projects : [];
        return '<p class="approval-delete-note">Permanently delete all '+approvalEscape(projects.length)+' '+(request.kind === 'occupancy' ? 'occupancy' : 'building')+' permit records below and their related records. Approval and activity history are retained.</p><p>New permits created after this request are excluded. Changes to the listed permits require a fresh request.</p><details class="approval-diff"><summary>See '+approvalEscape(projects.length)+' records to delete</summary><ul class="bulk-delete-scope">'+projects.map(p=>'<li>#'+approvalEscape(p.id)+' · '+approvalEscape(p.project_title)+'</li>').join('')+'</ul></details>';
    }
    if (request.change_type === 'inspection_delete') {
        const inspection = changes.inspection || {};
        return '<p class="approval-delete-note">Delete inspection #'+approvalEscape(changes.inspection_id)+' only. The parent permit will remain.</p><dl>'+[['Type',inspection.inspection_type],['Inspection date',String(inspection.inspection_date || '').slice(0,10)],['Inspector',inspection.inspector_name],['Result',inspection.result],['Findings / remarks',inspection.findings]].map(([label,value])=>'<dt>'+approvalEscape(label)+'</dt><dd>'+approvalEscape(value || '—')+'</dd>').join('')+'</dl>';
    }
    const before = changes._before;
    const rows = [];
    const format = v => Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '—' : String(v);
    function add(label, oldValue, newValue, known) {
        if (known && format(oldValue) === format(newValue)) return;
        if (compact) {
            rows.push('<div class="change-item"><div class="change-label">'+approvalEscape(label)+'</div><div class="change-values"><div class="change-before"><span class="change-caption">Before</span><span>'+approvalEscape(known ? format(oldValue) : 'Previous value unavailable')+'</span></div><svg class="change-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg><div class="change-after"><span class="change-caption">Proposed</span><span>'+approvalEscape(format(newValue))+'</span></div></div></div>');
        } else {
            rows.push('<tr><th scope="row">'+approvalEscape(label)+'</th><td>'+approvalEscape(known ? format(oldValue) : 'Previous value unavailable')+'</td><td class="proposed-value">'+approvalEscape(format(newValue))+'</td></tr>');
        }
    }
    const labels={project_title:'Project name',location:'Location',owner_name:'Owner / applicant',designer_name:'Designer',permit_date:'Permit date',lot_numbers:'Lots'};
    if (request.change_type === 'permit_update') {
        for (const [key,label] of Object.entries(labels)) if (changes[key] !== undefined) add(label,before?.[key],changes[key],!!before);
    } else if(request.change_type === 'station_dates') {
        const old=before?.matrix?.find(row=>Number(row.id)===Number(changes.station_id));
        for(const [key,label] of [['date_checked','Date Checked'],['date_approved','Date Approved']])add((old?.discipline_name || 'Station')+' · '+label,old?.[key] ? String(old[key]).slice(0,10) : '',changes[key],!!old);
    } else if (request.change_type === 'matrix_update') {
        for(const row of changes.updatedMatrixRows || []) {
            const old = before?.matrix?.find(item=>Number(item.id)===Number(row.id));
            const station = old ? old.discipline_name + (old.sub_permit_id ? ' (sub-permit '+old.sub_permit_id+')' : '') : 'Station #'+row.id;
            for(const [key,label] of [['engineer_name','Engineer'],['signature_status','Status'],['feedback_remarks','Remarks'],['date_checked','Date Checked'],['date_approved','Date Approved']]) {
                const calendar=value=>value ? String(value).slice(0,10) : '';
                if(row[key] !== undefined) add(station+' · '+label,key.startsWith('date_') ? calendar(old?.[key]) : old?.[key],key.startsWith('date_') ? calendar(row[key]) : row[key],!!old);
            }
        }
    }
    if (!rows.length) return '<p class="muted">No field values changed in this request.</p>';
    if (compact) return '<details class="compact-changes" open><summary>'+rows.length+' submitted change'+(rows.length===1?'':'s')+'</summary><div class="change-list">'+rows.join('')+'</div></details>';
    return '<details class="approval-diff"><summary>View '+rows.length+' submitted change'+(rows.length===1?'':'s')+'</summary><div class="approval-diff-scroll"><table><thead><tr><th>Field / station</th><th>Before submission</th><th>Proposed value</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div></details>';
}
