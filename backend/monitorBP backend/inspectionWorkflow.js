/**
 * MAINTAINER GUIDE
 * Inspection validation and inspection-only deletion requests.
 * Reject blank required fields and invalid dates before saving. Operators queue deletions for review; inspection creation uses the normal API directly.
 * A snapshot hash prevents an approval from deleting an inspection that changed after submission. The parent permit must remain intact.
 */
const crypto = require('node:crypto');
const {requireVersion}=require('./recordVersion');
const invalid = (message, status=400) => Object.assign(new Error(message), {status});
const hash = row => crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function validate(body) {
    for (const [key,label] of [['inspection_date','Inspection date'],['inspector_name','Inspector name'],['findings','Findings / remarks']]) {
        if(typeof body[key]!=='string' || !body[key].trim()) throw invalid(label+' is required.');
    }
    if(body.inspector_name.trim().length>150) throw invalid('Inspector name must be 150 characters or fewer.');
    if(!['Preliminary','Final','Follow-up','Special'].includes(body.inspection_type)) throw invalid('Select a valid inspection type.');
    if(!['Scheduled','Passed','Failed','Conditional'].includes(body.result)) throw invalid('Select a valid inspection result.');
    const calendar=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!calendar(body.inspection_date)) throw invalid('Enter a valid inspection date.');
    if(body.next_inspection_date && (!calendar(body.next_inspection_date) || body.next_inspection_date<body.inspection_date)) throw invalid('Next inspection must be a valid date on or after this inspection.');
}
module.exports = function createInspectionWorkflow(openConnection) {
    async function actor(conn,req,roles) {
        const id=Number(req.user?.id);
        if(!Number.isSafeInteger(id)||id<1)throw invalid('Please sign in again.',403);
        const [rows]=await conn.query('SELECT id, role FROM users WHERE id=? AND is_active=1 AND is_verified=1',[id]);
        if(!rows[0] || !roles.includes(rows[0].role) || rows[0].role!==req.user?.role)throw invalid('Your account cannot perform this action.',403);
        return rows[0];
    }
    async function run(res,operation) {
        let conn;
        try {conn=await openConnection();await conn.beginTransaction();const result=await operation(conn);await conn.commit();return res.status(result.status||200).json(result.body);}
        catch(e){if(conn)await conn.rollback().catch(()=>{});return res.status(e.status||500).json({success:false,conflict:e.status===409,message:e.status?e.message:'Unable to save this record. No changes were applied.'});}
        finally{if(conn)await conn.end();}
    }
    async function lockParent(conn,id) {
        const [rows]=await conn.query('SELECT id FROM occupancy_permits WHERE id=? FOR UPDATE',[id]);
        if(!rows.length)throw invalid('Occupancy record not found.',404);
    }
    const submit=(req,res)=>run(res,async conn=>{
        const user=await actor(conn,req,['operator','admin','superadmin']);
        const id=Number(req.params.id),inspectionId=Number(req.params.inspId);
        if(![id,inspectionId].every(n=>Number.isSafeInteger(n)&&n>0))throw invalid('Invalid inspection ID.');
        await lockParent(conn,id);
        const [rows]=await conn.query('SELECT * FROM occupancy_inspections WHERE id=? AND occupancy_id=? FOR UPDATE',[inspectionId,id]);
        if(!rows.length)throw invalid('Inspection not found.',404);
        requireVersion(req,hash(rows[0]));
        if(user.role!=='operator') {
            await conn.query('DELETE FROM occupancy_inspections WHERE id=? AND occupancy_id=?',[inspectionId,id]);
            return {body:{success:true,message:'Inspection record deleted.'}};
        }
        const [pending]=await conn.query("SELECT id, changes FROM occupancy_change_requests WHERE occupancy_id=? AND change_type='inspection_delete' AND status='pending' FOR UPDATE",[id]);
        for(const request of pending) {
            const changes=typeof request.changes==='string'?JSON.parse(request.changes):request.changes;
            if(Number(changes.inspection_id)===inspectionId)return {status:409,body:{success:false,duplicate:true,message:'A deletion request for this inspection is already awaiting administrator approval.'}};
        }
        const changes={inspection_id:inspectionId,inspection:rows[0],_inspectionSnapshot:hash(rows[0])};
        await conn.query("INSERT INTO occupancy_change_requests (occupancy_id,requested_by,change_type,changes,status,remarks) VALUES (?,?,'inspection_delete',?,'pending',?)",[id,user.id,JSON.stringify(changes),'Delete this inspection only; retain the occupancy permit.']);
        return {body:{success:true,pending:true,message:'Inspection deletion submitted for administrator approval. The inspection remains until approved.'}};
    });
    function review(decision) {
        return async(req,res,next)=>{
            // Dispatch only this request type; existing edit/deletion handlers retain theirs.
            let probe;
            try {probe=await openConnection();const [rows]=await probe.query('SELECT change_type FROM occupancy_change_requests WHERE id=?',[req.params.id]);if(rows[0]?.change_type!=='inspection_delete')return next();}
            catch(e){return res.status(500).json({success:false,message:'Unable to read inspection request.'});}
            finally{if(probe)await probe.end();}
            return run(res,async conn=>{
                const user=await actor(conn,req,['admin','superadmin']);
                const [initial]=await conn.query('SELECT occupancy_id FROM occupancy_change_requests WHERE id=?',[req.params.id]);
                if(!initial.length)throw invalid('Request no longer exists.',404);
                const id=initial[0].occupancy_id;await lockParent(conn,id);
                const [requests]=await conn.query('SELECT * FROM occupancy_change_requests WHERE id=? FOR UPDATE',[req.params.id]);
                const request=requests[0];
                if(!request || request.status!=='pending')throw invalid('This request was already reviewed.',409);
                const changes=typeof request.changes==='string'?JSON.parse(request.changes):request.changes;
                let status='rejected',message='Inspection deletion declined. Inspection retained.';
                if(decision==='approve') {
                    const [rows]=await conn.query('SELECT * FROM occupancy_inspections WHERE id=? AND occupancy_id=? FOR UPDATE',[changes.inspection_id,id]);
                    if(!rows.length || hash(rows[0])!==changes._inspectionSnapshot){status='conflict';message='Inspection changed or no longer exists. Deletion blocked; refresh and submit a fresh request.';}
                    else {await conn.query('DELETE FROM occupancy_inspections WHERE id=? AND occupancy_id=?',[changes.inspection_id,id]);status='approved';message='Inspection deletion approved. Occupancy permit retained.';}
                }
                await conn.query('UPDATE occupancy_change_requests SET status=?,reviewed_by=?,reviewed_at=NOW(),remarks=? WHERE id=?',[status,String(user.id),message,request.id]);
                return {status:status==='conflict'?409:200,body:{success:status!=='conflict',conflict:status==='conflict',message}};
            });
        };
    }
    const readInspections=(req,res)=>run(res,async conn=>{
        await lockParent(conn,Number(req.params.id));
        const [rows]=await conn.query('SELECT * FROM occupancy_inspections WHERE occupancy_id=? ORDER BY inspection_date DESC,id DESC',[req.params.id]);
        return {body:{success:true,inspections:rows.map(row=>({...row,inspection_date:require('./stationDates').calendar(row.inspection_date),next_inspection_date:row.next_inspection_date?require('./stationDates').calendar(row.next_inspection_date):null,_version:hash(row)}))}};
    });
    function save(update=false) {
        return (req,res)=>run(res,async conn=>{
            await actor(conn,req,['operator','admin','superadmin']);validate(req.body);
            const id=Number(req.params.id);await lockParent(conn,id);
            if(update) {
                const [rows]=await conn.query('SELECT * FROM occupancy_inspections WHERE id=? AND occupancy_id=? FOR UPDATE',[req.params.inspId,id]);
                if(!rows.length)throw invalid('Inspection no longer exists.',404);
                requireVersion(req,hash(rows[0]));
            }
            const clean=value=>String(value??'').trim().replace(/<[^>]*>/g,'');
            const fields=['inspection_type','inspection_date','inspector_name','result','findings','next_inspection_date'];
            const values=fields.map(key=>key==='next_inspection_date'&&!req.body[key]?null:clean(req.body[key]));
            let inspectionId=Number(req.params.inspId);
            if(update)await conn.query('UPDATE occupancy_inspections SET '+fields.map(key=>key+'=?').join(',')+' WHERE id=? AND occupancy_id=?',[...values,req.params.inspId,id]);
            else {const [inserted]=await conn.query('INSERT INTO occupancy_inspections (occupancy_id,'+fields.join(',')+') VALUES (?,?,?,?,?,?,?)',[id,...values]);inspectionId=inserted.insertId;}
            return {body:{success:true,id:inspectionId,message:update?'Inspection updated.':'Inspection record logged.'}};
        });
    }
    async function checklist(conn,id) {
        const [rows]=await conn.query('SELECT checklist_state FROM occupancy_checklists WHERE occupancy_id=? FOR UPDATE',[id]);
        const raw=rows[0]?.checklist_state;
        const state=typeof raw==='string'?JSON.parse(raw):(raw||{});
        const normalized=Object.fromEntries(Object.entries(state).sort(([a],[b])=>a.localeCompare(b)));
        return {state,version:hash({id:Number(id),state:normalized})};
    }
    const readChecklist=(req,res)=>run(res,async conn=>{
        await lockParent(conn,Number(req.params.id));
        const current=await checklist(conn,req.params.id);
        return {body:{success:true,checklist_state:current.state,_version:current.version}};
    });
    const saveChecklist=(req,res)=>run(res,async conn=>{
        await actor(conn,req,['operator','admin','superadmin']);
        const id=Number(req.params.id);await lockParent(conn,id);
        const current=await checklist(conn,id);requireVersion(req,current.version);
        const state=req.body.checklist_state;
        if(!state||Array.isArray(state)||typeof state!=='object'||Object.keys(state).length>1000||Object.values(state).some(value=>typeof value!=='boolean'))throw invalid('Checklist values must be true or false.');
        await conn.query('INSERT INTO occupancy_checklists (occupancy_id,checklist_state) VALUES (?,?) ON DUPLICATE KEY UPDATE checklist_state=VALUES(checklist_state)',[id,JSON.stringify(state)]);
        return {body:{success:true,message:'Checklist saved.',_version:(await checklist(conn,id)).version}};
    });
    return {submit,review,readInspections,save,readChecklist,saveChecklist};
};
module.exports.validate=validate;
