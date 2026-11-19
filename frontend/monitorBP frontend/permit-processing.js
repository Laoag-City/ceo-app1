(() => {
    const workingDays=count=>`${count} working day${count===1?'':'s'}`;
    const displayDate=value=>{
        const [year,month,day]=value.split('-');
        return `${month}/${day}/${year}`;
    };

    window.renderPermitDeadline=deadline=>{
        const container=document.getElementById('permitProcessingDeadline');
        if(!container)return;
        const label=document.createElement('span');
        label.className='meta-label';
        label.textContent='Processing deadline';
        const detail=document.createElement('strong');
        detail.textContent=deadline?`${deadline.category} · ${workingDays(deadline.working_days)}`:'Processing time not set';
        container.replaceChildren(label,detail);
        container.hidden=false;
        if(!deadline)return;
        const due=document.createElement('span');
        due.textContent=deadline.due_on?`Due ${displayDate(deadline.due_on)}`:'Deadline unavailable';
        container.append(due);
        if(!deadline.due_on)return;
        const remaining=document.createElement('strong');
        if(deadline.status==='completed_late') {
            remaining.textContent=deadline.overdue_working_days?`Approved ${workingDays(deadline.overdue_working_days)} late`:'Approved after deadline';
        } else if(deadline.status==='completed') {
            remaining.textContent=`Approved with ${workingDays(deadline.remaining_working_days)} remaining`;
        } else if(deadline.status==='overdue') {
            const late=deadline.overdue_working_days?`${workingDays(deadline.overdue_working_days)} overdue`:'Deadline passed';
            remaining.textContent=`0 working days remaining · ${late}`;
        } else {
            const count=`${workingDays(deadline.remaining_working_days)} remaining`;
            remaining.textContent=deadline.status==='due_today'?`Due today · ${count}`:count;
        }
        container.append(remaining);
    };
})();
