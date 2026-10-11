// Read-only engineering history. Audit and final-review rows survive project deletion.
const dates=require('./stationDates'),changes=require('./projectChanges');
const kinds=['permits','occupancy'],sources=['request','activity','final_review'];
const invalid=()=>Object.assign(Error('Invalid history filters or cursor.'),{status:400});
const decode=value=>{try{return typeof value==='string'?JSON.parse(value):value}catch{return null}};
const objects=value=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
const text=value=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
function detail(source,parsed,raw){
 if(parsed?.type==='bulk_delete')return {text:'Requested deletion of '+objects(parsed.projects).length+' permit records.\n'+objects(parsed.projects).map(p=>'#'+text(p.record?.id)+' · '+text(p.record?.project_title)).join('\n')+(parsed.reviewed_by?'\nReviewed by '+text(parsed.reviewed_by)+' · '+text(parsed.reviewed_at)+' · '+text(parsed.decision):'\nAwaiting admin review.')};
 if(source==='request'){
  try{
   const before=parsed?._before || {};
   const list=parsed&&changes.fromSnapshot({...before,matrix:objects(before.matrix)}, {...parsed, ...(Array.isArray(parsed.updatedMatrixRows)?{updatedMatrixRows:objects(parsed.updatedMatrixRows)}:{})});
   if(list?.length)return {changes:list};
  }catch{/* Keep legacy submitted values visible even without a usable baseline. */}
  return raw?{text:'Recorded submission:\n'+(typeof raw==='string'?raw:JSON.stringify(raw,null,2))}:null;
 }
 if(source==='final_review'){
  if(!parsed)return raw?{text:text(raw)}:null;
  const names=new Map(objects(parsed.reviewed_engineers).map(row=>[Number(row.station_id),text(row.display_name)]));
  const subs=new Map(objects(parsed.subs).map(row=>[Number(row.id),text(row.sub_project_title)]));
  return {stations:[...objects(parsed.matrix),...objects(parsed.subMatrix)].map(row=>({id:row.id,station:text(row.discipline_name),engineer:names.get(Number(row.id)) || text(row.engineer_name),status:text(row.signature_status),date_checked:dates.calendar(row.date_checked),date_approved:dates.calendar(row.date_approved),remarks:text(row.feedback_remarks),sub_permit:subs.get(Number(row.sub_permit_id)) || ''}))};
 }
 return parsed?.version===1&&Array.isArray(parsed.changes)?{changes:objects(parsed.changes).map(row=>({field:text(row.field),before:text(row.before),after:text(row.after)}))}:raw?{text:text(raw)}:null;
}
const projection=`SELECT r.id,'request' source,'permits' kind,r.permit_id project_id,
 COALESCE(p.project_title,(SELECT a.project_title FROM project_records a WHERE a.kind='permits' AND a.project_id=r.permit_id ORDER BY a.id DESC LIMIT 1),CONCAT('Building permit #',r.permit_id)) project_title,
 r.status,r.change_type event_type,CONCAT('Request: ',r.change_type) message,
 COALESCE(u.username,CASE WHEN r.requested_by IS NULL THEN 'Unknown operator' ELSE CONCAT('Account #',r.requested_by) END) actor_name,r.created_at,COALESCE(r.remarks,'') remarks
 FROM permit_change_requests r LEFT JOIN permits p ON p.id=r.permit_id LEFT JOIN users u ON u.id=r.requested_by
 UNION ALL
 SELECT r.id,'request','occupancy',r.occupancy_id,
 COALESCE(p.project_title,(SELECT a.project_title FROM project_records a WHERE a.kind='occupancy' AND a.project_id=r.occupancy_id ORDER BY a.id DESC LIMIT 1),CONCAT('Occupancy permit #',r.occupancy_id)),
 r.status,r.change_type,CONCAT('Request: ',r.change_type),COALESCE(u.username,CASE WHEN r.requested_by IS NULL THEN 'Unknown operator' ELSE CONCAT('Account #',r.requested_by) END),r.created_at,COALESCE(r.remarks,'')
 FROM occupancy_change_requests r LEFT JOIN occupancy_permits p ON p.id=r.occupancy_id LEFT JOIN users u ON u.id=r.requested_by
 UNION ALL
 SELECT a.id,'activity',a.kind,a.project_id,a.project_title,a.outcome,a.category,a.message,a.actor_name,a.created_at,''
 FROM project_records a WHERE a.kind IN ('permits','occupancy') AND a.outcome<>'failed'
 UNION ALL
 SELECT f.id,'final_review',f.kind,f.project_id,
 COALESCE(b.project_title,o.project_title,(SELECT a.project_title FROM project_records a WHERE a.kind=f.kind AND a.project_id=f.project_id ORDER BY a.id DESC LIMIT 1),CONCAT('Permit #',f.project_id)),
 f.decision,f.decision,CASE f.decision WHEN 'approved' THEN 'Final project approval' WHEN 'returned' THEN 'Returned for correction' ELSE 'Fresh final review required' END,
 f.reviewer_name,f.created_at,f.remarks
 FROM permit_final_reviews f LEFT JOIN permits b ON f.kind='permits' AND b.id=f.project_id
 LEFT JOIN occupancy_permits o ON f.kind='occupancy' AND o.id=f.project_id`;
// Preserve database timestamp precision and its local wall time. JS Date loses
// PostgreSQL microseconds and could skip history at a page boundary.
function cursor(row){return Buffer.from(JSON.stringify({at:row.history_time,source:row.source,kind:row.kind,id:Number(row.id)})).toString('base64url')}
function filters(input){
 const q=String(input.q || '').trim(),kind=String(input.kind || 'all'),source=String(input.source || 'all');
 if(q.length>100 || !['all',...kinds].includes(kind) || !['all',...sources].includes(source))throw invalid();
 let before=null;
 if(input.before){
  if(typeof input.before!=='string'||input.before.length>512||!/^[\w-]+$/.test(input.before))throw invalid();
  before=decode(Buffer.from(input.before,'base64url').toString('utf8'));
  if(!before||!sources.includes(before.source)||!kinds.includes(before.kind)||!Number.isSafeInteger(before.id)||before.id<1||typeof before.at!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(before.at)||!Number.isFinite(Date.parse(before.at.replace(' ','T')+'Z')))throw invalid();
 }
 return {q,kind,source,before};
}
module.exports=async function history(query,input={},limit=25,includeDetails=true){
 const {q,kind,source,before}=filters(input),where=[],args=[];
 if(kind!=='all'){where.push('kind=?');args.push(kind)}
 if(source!=='all'){where.push('source=?');args.push(source)}
 if(q){where.push("LOWER(CONCAT(project_title,' ',actor_name,' ',message,' ',remarks,' ',COALESCE(project_id,0),' ',id)) LIKE ? ESCAPE '!'");args.push('%'+q.toLowerCase().replace(/[!%_]/g,value=>'!'+value)+'%')}
 if(before){where.push('(created_at<? OR (created_at=? AND (source>? OR (source=? AND (kind>? OR (kind=? AND id<?))))))');args.push(before.at,before.at,before.source,before.source,before.kind,before.kind,before.id)}
 const rows=await query(`SELECT *,DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS history_time FROM (${projection}) history ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,source,kind,id DESC LIMIT ${limit+1}`,args);
 const more=rows.length>limit,records=rows.slice(0,limit);
 if(includeDetails){
  for(const [source,kind,table,field] of [['request','permits','permit_change_requests','changes'],['request','occupancy','occupancy_change_requests','changes'],['activity',null,'project_records','details'],['final_review',null,'permit_final_reviews','snapshot']]){
   const entries=records.filter(row=>row.source===source&&(!kind||row.kind===kind));if(!entries.length)continue;
   const details=await query(`SELECT id,${field}${source==='request'?',reviewed_by,reviewed_at':''} FROM ${table} WHERE id IN (?)`,[entries.map(row=>row.id)]),byId=new Map(details.map(row=>[Number(row.id),row]));
   for(const entry of entries){
    const raw=byId.get(Number(entry.id)),parsed=decode(raw?.[field]);
    if(source==='request'){
     entry.reviewed_by=raw?.reviewed_by || '';entry.reviewed_at=raw?.reviewed_at || null;
    }
    entry.details=detail(source,parsed,raw?.[field]);
   }
  }
 }
 return {records,next:more?cursor(records[records.length-1]):null};
};
