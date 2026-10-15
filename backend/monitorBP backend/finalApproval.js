const crypto=require('node:crypto'),dates=require('./stationDates');
const text=value=>String(value ?? '').trim();
function fingerprint(state) {
    const record=Object.fromEntries(['id','project_title','location','owner_name','designer_name','bp_reference_no','permit_date','date_applied'].filter(k=>state.record[k]!==undefined).map(k=>[k,k.endsWith('_date')||k==='date_applied'?dates.calendar(state.record[k]):text(state.record[k])]));
    const matrix=[...state.matrix,...(state.subMatrix || [])].map(row=>[Number(row.id),Number(row.sub_permit_id || 0),text(row.discipline_name),text(row.engineer_name),text(row.signature_status || 'Pending'),dates.calendar(row.date_checked),dates.calendar(row.date_approved),text(row.feedback_remarks)]).sort((a,b)=>a[0]-b[0]);
    return crypto.createHash('sha256').update(JSON.stringify([record,matrix,(state.lots || []).map(r=>[Number(r.id),text(r.lot_number)]),(state.subs || []).map(r=>[Number(r.id),text(r.sub_project_title)])])).digest('hex');
}
function summary(state,reviews=[]) {
    const rows=[...state.matrix,...(state.subMatrix || [])];
    const allApproved=state.matrix.length>0 && rows.every(r=>r.signature_status==='Approved') && (!state.subs || state.subs.every(s=>(state.subMatrix || []).some(r=>Number(r.sub_permit_id)===Number(s.id))));
    const latest=reviews[0],hash=fingerprint(state);
    let status=rows.some(r=>r.signature_status==='Rejected')?'correction':'in_review';
    if(latest?.decision==='approved' && latest.snapshot_hash===hash && allApproved)status='approved';
    else if(latest?.decision==='returned' && latest.snapshot_hash===hash)status='returned';
    else if(allApproved)status='ready';
    return {status,all_stations_approved:allApproved,ready:status==='ready',label:({approved:'Finally approved',ready:'Ready for final review',returned:'Returned for correction',correction:'Station correction needed',in_review:'Station review in progress'})[status],remarks:latest?.decision==='returned'?latest.remarks:'',history:reviews.map(({snapshot,...r},index)=>({...r,current:r.decision==='approved' && index===0 && status==='approved'}))};
}
async function invalidate(conn,kind,id,user,state) {
    const [rows]=await conn.query('SELECT decision FROM permit_final_reviews WHERE kind=? AND project_id=? ORDER BY id DESC LIMIT 1',[kind,id]);
    if(rows[0]?.decision==='approved')await conn.query("INSERT INTO permit_final_reviews (kind,project_id,decision,reviewer_id,reviewer_name,remarks,snapshot_hash,snapshot) VALUES (?,?,'invalidated',?,?,?, ?,?)",[kind,id,user.id,await require('./stationAccess').displayName(conn,user),'Project details changed; a fresh final review is required.',fingerprint(state),JSON.stringify(state)]);
}
async function reviewHistory(conn,kind,id){
    const [rows]=await conn.query(`SELECT f.*,COALESCE(NULLIF(TRIM(p.display_name),''),f.reviewer_name) AS reviewer_name
        FROM permit_final_reviews f LEFT JOIN permit_user_profiles p ON p.user_id=f.reviewer_id
        WHERE f.kind=?${id===undefined?'':' AND f.project_id=?'} ORDER BY f.id DESC`,id===undefined?[kind]:[kind,id]);
    return rows;
}
async function projectList(conn,kind) {
    const building=kind==='permits',table=building?'permits':'occupancy_permits',matrixTable=building?'permit_routing_matrix':'occupancy_routing_matrix',column=building?'permit_id':'occupancy_id';
    const [records]=await conn.query('SELECT * FROM '+table+' ORDER BY id DESC');
    const [matrix]=await conn.query('SELECT * FROM '+matrixTable+' ORDER BY id');
    const reviews=await reviewHistory(conn,kind);
    let subs=[],lots=[];
    if(building){[subs]=await conn.query('SELECT * FROM sub_permits ORDER BY id');[lots]=await conn.query('SELECT * FROM permit_lots ORDER BY id');}
    return records.map(record=>{
        const ownSubs=subs.filter(s=>Number(s.permit_id)===Number(record.id)),subIds=new Set(ownSubs.map(s=>Number(s.id)));
        const state={record,matrix:matrix.filter(m=>Number(m[column])===Number(record.id)),...(building?{subs:ownSubs,lots:lots.filter(r=>Number(r.permit_id)===Number(record.id)),subMatrix:matrix.filter(m=>subIds.has(Number(m.sub_permit_id)))}:{})};
        return {...record,kind,final_approval:summary(state,reviews.filter(r=>Number(r.project_id)===Number(record.id)))};
    });
}
module.exports={fingerprint,summary,invalidate,projectList,reviewHistory};
