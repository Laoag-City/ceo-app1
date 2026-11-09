/* Server-calculated read-only indicators, shared by both registry controllers. */
(function(root){
    const labels={normal:'Within threshold',followup:'Follow-up due',overdue:'Overdue',completed:'Finally approved',unknown:'Check dates'};
    const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    const days=(value,suffix)=>value===null?'Date unavailable':value===0&&suffix==='since filing'?'Filed today':`${value} ${value===1?'day':'days'} ${suffix}`;
    function cell(aging){
        const a=aging||{},status=Object.hasOwn(labels,a.status)?a.status:'unknown',age=number(a.age_days),idle=number(a.inactive_days);
        const followup=number(a.followup_days),overdue=number(a.overdue_days);
        const tooltip=`Calendar days. Follow-up at ${followup??'—'} days and overdue at ${overdue??'—'} days without recorded activity. These are follow-up reminders.`;
        const activity=status==='completed'?'Follow-up clock stopped':status==='unknown'?'Check filing or activity date':a.basis==='filing'?'No activity log; using filing date':days(idle,'without activity');
        const idleText=status!=='completed' && status!=='unknown' && a.basis==='filing'?`${days(idle,'without activity')} · ${activity}`:activity;
        return `<div class="permit-aging" title="${tooltip}"><span class="permit-aging-badge permit-aging-${status}">${labels[status]}</span><span class="permit-aging-age">${days(age,'since filing')}</span><span class="permit-aging-detail">${idleText}</span></div>`;
    }
    function updatePolicy(records){
        const host=document.getElementById('registryAgingPolicy');if(!host)return;
        const indicators=records.map(p=>p?.aging).filter(Boolean),settings=indicators[0];
        if(!settings){host.textContent=records.length?'Aging information unavailable. Refresh the registry after restarting the updated permit server.':'Calendar-day indicators appear when permit records are available.';return;}
        const needs=indicators.filter(a=>a.status==='followup'||a.status==='overdue').length,overdue=indicators.filter(a=>a.status==='overdue').length;
        const date=/^\d{4}-\d{2}-\d{2}$/.test(settings.as_of)?settings.as_of:'unknown date';
        host.textContent=`${needs} need follow-up · ${overdue} overdue. Follow-up: ${number(settings.followup_days)??'—'} days; overdue: ${number(settings.overdue_days)??'—'} days without recorded activity. Calendar days as of ${date}.`;
    }
    const api={cell,updatePolicy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PermitAging=api;
})(typeof window==='undefined'?globalThis:window);
