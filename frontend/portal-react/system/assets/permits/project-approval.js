(function(root){
    function render(data){
        const status=data.final_approval;
        let panel=document.getElementById('projectFinalApproval');
        if(!panel){panel=document.createElement('section');panel.id='projectFinalApproval';panel.className='project-final-approval';const table=document.getElementById('matrixTableBody')?.closest('.card') || document.getElementById('matrixTableBody')?.closest('table');if(table)table.before(panel);}
        if(!panel)return;
        panel.replaceChildren();
        const heading=document.createElement('strong');heading.textContent=status?.label || 'Final approval status unavailable';panel.append(heading);
        const help=document.createElement('p');help.textContent=status?.status==='approved'?'The admin has given this project its final approval. Later station edits require another review.':status?.status==='ready'?'Every required station is approved. The project is awaiting final review by the admin.':'Station approvals and final project approval are tracked separately.';panel.append(help);
        if(status?.remarks){const remarks=document.createElement('p');remarks.textContent='Admin correction remarks: '+status.remarks;panel.append(remarks);}
        const assigned=Array.isArray(data.assigned_stations)?data.assigned_stations:(data.assigned_station?[data.assigned_station]:[]);
        const assignment=document.createElement('p');assignment.textContent=assigned.length?'Your assigned '+(assigned.length===1?'station: ':'stations: ')+assigned.join(', ')+'. '+(Array.isArray(data.sub_permits)?'You can edit their rows in the main permit and sub-permits.':'You can edit their rows when included in the occupancy workflow.'):'Your account has no station assignment. Ask the IT team to assign a station before editing.';panel.append(assignment);
        if(status?.history.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Final review history';details.append(summary);for(const entry of status.history){const p=document.createElement('p');p.textContent=(entry.decision==='approved'?'Final approval':entry.decision==='returned'?'Returned for correction':'Fresh review required')+' · '+entry.reviewer_name+' · '+new Date(entry.created_at).toLocaleString('en-PH')+(entry.remarks?' — '+entry.remarks:'');details.append(p);}panel.append(details);}
        badge(data);
    }
    function badge(data){const el=document.getElementById('globalWorkflowStatus');if(!el)return;const status=data.final_approval;el.textContent=status?.label || 'Final approval unavailable';el.className='global-status-badge '+(status?.status==='approved'?'status-approved':['returned','correction'].includes(status?.status)?'status-rejected':'status-pending');}
    root.ProjectApproval={render,badge};
})(window);
