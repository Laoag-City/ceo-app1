/* Show recorded registration time; never substitute the filing date or today's date. */
(() => {
    const dateFormat=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
    const timeFormat=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'numeric',minute:'2-digit'});
    let generation=0;
    function show(node,value) {
        const date=value?new Date(value):null;
        if(!date || !Number.isFinite(date.getTime())){
            node.textContent='Not recorded';node.removeAttribute('datetime');node.removeAttribute('title');return;
        }
        node.textContent=dateFormat.format(date);node.dateTime=date.toISOString();
        node.title=timeFormat.format(date)+' (Asia/Manila)';
    }
    async function load(record,kind) {
        const node=document.getElementById('permitAddedAt');
        if(!node)return;
        const current=++generation;
        if(record.created_at){show(node,record.created_at);return;}
        node.textContent='Loading…';node.removeAttribute('datetime');node.removeAttribute('title');
        try {
            const response=await RequestFeedback.fetch('/api/project-added-at/'+kind+'/'+encodeURIComponent(record.id));
            const result=await response.json();
            if(current!==generation)return;
            if(!response.ok || !result.success)throw new Error();
            show(node,result.created_at);
        } catch {
            if(current===generation){node.textContent='Unavailable';node.title='Refresh the page to retry loading the system-added date.';}
        }
    }
    window.PermitAddedAt={load};
})();
