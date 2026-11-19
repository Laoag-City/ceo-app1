// System registration timestamps are distinct from applicant-supplied filing dates.
const tables={permits:'permits',occupancy:'occupancy_permits'};
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
function createReader(db) {
    return async(kind,input)=>{
        const id=Number(input),table=Object.hasOwn(tables,kind)?tables[kind]:null;
        if(!table || !/^[1-9]\d*$/.test(String(input)) || !Number.isSafeInteger(id))throw bad('Choose a valid permit.');
        const [[record]]=await db.query(`SELECT id${kind==='permits'?',created_at':''} FROM ${table} WHERE id=?`,[id]);
        if(!record)throw bad('This permit no longer exists.',404);
        if(record.created_at)return record.created_at;
        // Creation retries and imports are committed with the permit. The saved
        // creation audit is a fallback for older clients without a request key.
        const contains=db.dialect==='postgres'?'project_ids::jsonb @> ?::jsonb':'JSON_CONTAINS(project_ids, ?)';
        const [[event]]=await db.query(`SELECT MIN(created_at) AS created_at FROM (
            SELECT created_at FROM permit_creation_requests WHERE kind=? AND project_id=?
            UNION ALL SELECT created_at FROM project_records
                WHERE kind=? AND project_id=? AND category='activity' AND outcome='saved' AND message='Created project'
            UNION ALL SELECT created_at FROM permit_import_batches WHERE kind=? AND ${contains}
        ) creation_events`,[kind,id,kind,id,kind,JSON.stringify(db.dialect==='postgres'?[id]:id)]);
        return event?.created_at || null;
    };
}
function register(app,db,sessions) {
    const read=createReader(db);
    app.get('/api/project-added-at/:kind/:id',sessions.requireRoles('operator','admin'),async(req,res)=>{
        res.set('Cache-Control','no-store');
        try {res.json({success:true,created_at:await read(req.params.kind,req.params.id)});}
        catch(error){res.status(error.status || 503).json({success:false,message:error.status?error.message:'The system-added date could not be loaded. Please refresh to retry.'});}
    });
}
module.exports={createReader,register};
