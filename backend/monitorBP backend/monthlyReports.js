/** Read-only monthly engineering reports. Filing counts use filing dates;
 * decision counts use recorded action dates, not today's matrix status.
 * Each parent permit counts once per metric/month (sub-permits are not applications).
 * Processing time uses the last approval in the month and its saved filing date.
 */
const {calendar,officeToday}=require('./permitAging');
const MAX_ROWS=10000, PAGE_SIZE=20;
const validKind=kind=>['permits','occupancy'].includes(kind);
const decode=value=>{try{return typeof value==='string'?JSON.parse(value):value}catch{return null}};
const bad=message=>Object.assign(Error(message),{status:400});
function day(value){
    if(value instanceof Date)return calendar(value);
    const text=String(value??'');
    if(calendar(text))return text;
    // Old snapshots serialized DATE as local midnight. Interpret ISO timestamps
    // in Manila; never truncate the UTC string to the preceding calendar day.
    if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(text)){
        const date=new Date(text);return Number.isFinite(date.getTime())?officeToday(date):null;
    }
    // Legacy rejection history was explicitly written as en-US Manila time.
    const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)?$/i.exec(text);
    return match?calendar(`${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`):null;
}
const addDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
function filters(query={},today=officeToday()){
    const previous=new Date(Date.parse(today.slice(0,7)+'-01T12:00:00Z'));previous.setUTCMonth(previous.getUTCMonth()-1);
    const month=query.month??previous.toISOString().slice(0,7),kind=query.kind??'all',page=query.page??'1';
    if(typeof month!=='string'||! /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))throw bad('Choose a valid reporting month up to the current month.');
    if(!['all','permits','occupancy'].includes(kind))throw bad('Choose Building, Occupancy, or both permit types.');
    if(typeof page!=='string'||! /^[1-9]\d{0,5}$/.test(page))throw bad('Choose a valid report page.');
    const from=month+'-01',next=new Date(from+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    const monthEnd=next.toISOString().slice(0,10),exclusive=month===today.slice(0,7)?addDays(today,1):monthEnd;
    return {month,kind,page:Number(page),from,to:addDays(exclusive,-1),exclusive,as_of:today,timezone:'Asia/Manila',month_to_date:month===today.slice(0,7)};
}
function archives(rows){
    const result=[];
    for(const row of rows){const parsed=decode(row.details);let projects=[];
        if(row.category==='bulk_delete'&&row.outcome==='approved'&&parsed?.type==='bulk_delete')projects=parsed.projects;
        if(row.category==='activity'&&row.outcome==='saved'&&['direct','approved_request'].includes(parsed?.deletion?.mode))projects=[parsed.deletion.project];
        if(validKind(row.kind)&&Array.isArray(projects))for(const project of projects)if(project?.record)result.push({kind:row.kind,...project});
    }
    return result;
}
function build(data,period){
    const inPeriod=date=>!!date&&date>=period.from&&date<period.exclusive;
    const wanted=kind=>validKind(kind)&&(period.kind==='all'||period.kind===kind);
    const key=(kind,id)=>kind+':'+Number(id),validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0;
    const projects=new Map(),live=new Set(),reviewRows=[...data.reviews],archived=archives(data.archives);
    const put=(kind,record,isArchived,overwrite=false)=>{
        if(!wanted(kind)||!validId(record?.id))return;
        const k=key(kind,record.id);if(!overwrite&&projects.has(k))return;
        projects.set(k,{kind,id:Number(record.id),reference:(kind==='permits'?'BP-':'OP-')+record.id,
            project_title:String(record.project_title||((kind==='permits'?'Building':'Occupancy')+' permit #'+record.id)),owner_name:String(record.owner_name||''),location:String(record.location||''),
            filed_on:day(record.filing_on??(kind==='permits'?record.permit_date:record.date_applied)),archived:isArchived,history:decode(record.rejection_history),events:[],approval:null});
    };
    for(const row of data.current){if(wanted(row.kind)){live.add(key(row.kind,row.id));put(row.kind,row,false,true);}}
    for(const state of archived){put(state.kind,state.record,true);for(const review of state.final_reviews||[])reviewRows.push({...review,kind:state.kind,event_on:day(review.event_on??review.created_at)});}
    const uniqueReviews=new Map();
    for(const review of reviewRows){if(!wanted(review.kind)||!validId(review.project_id))continue;const date=day(review.event_on??review.created_at);if(!inPeriod(date)||!['approved','returned'].includes(review.decision))continue;
        const dedup=review.id?review.kind+':'+review.id:[review.kind,review.project_id,review.decision,date].join(':');
        if(!uniqueReviews.has(dedup))uniqueReviews.set(dedup,{...review,event_on:date});
    }
    const reviews=[...uniqueReviews.values()].sort((a,b)=>a.event_on.localeCompare(b.event_on)||Number(a.id||0)-Number(b.id||0));
    for(const review of reviews){const state=decode(review.snapshot),id=Number(review.project_id),k=key(review.kind,id);
        if(!projects.has(k))put(review.kind,{...(state?.record||{}),id},!live.has(k));
        const project=projects.get(k);if(!project)continue;
        if(review.decision==='approved')project.approval={date:review.event_on,filed:day(state?.record?(review.kind==='permits'?state.record.permit_date:state.record.date_applied):null)};
        else project.events.push({type:'returned',date:review.event_on});
    }
    for(const row of data.activities){if(!wanted(row.kind)||!validId(row.project_id)||row.outcome!=='saved'||row.category!=='activity'||/^Submitted for administrator approval:/i.test(row.message||''))continue;
        const date=day(row.event_on??row.created_at),detail=decode(row.details);
        if(!inPeriod(date)||!Array.isArray(detail?.changes)||!detail.changes.some(change=>/ · Status$/.test(String(change.field))&&change.after==='Rejected'&&change.before!=='Rejected'))continue;
        const k=key(row.kind,row.project_id);if(!projects.has(k))put(row.kind,{id:row.project_id,project_title:row.project_title},!live.has(k));
        projects.get(k)?.events.push({type:'returned',date});
    }
    let invalidHistoryDates=0;
    for(const project of projects.values()){
        if(Array.isArray(project.history))for(const entry of project.history){if(!entry||typeof entry!=='object'||(entry.status&&entry.status!=='Rejected'))continue;const date=day(entry.timestamp??entry.date);if(!date){invalidHistoryDates++;continue;}if(inPeriod(date))project.events.push({type:'returned',date});}
        if(inPeriod(project.filed_on))project.events.push({type:'filed',date:project.filed_on});
        if(project.approval)project.events.push({type:'approved',date:project.approval.date});
    }
    const records=[...projects.values()].filter(p=>p.events.length).map(project=>{
        const events=[...new Map(project.events.map(event=>[event.type+event.date,event])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
        const approval=project.approval,elapsed=approval?.filed&&approval.date>=approval.filed?Math.round((Date.parse(approval.date+'T00:00:00Z')-Date.parse(approval.filed+'T00:00:00Z'))/86400000):null;
        const {history,...record}=project;
        return {...record,approval:undefined,events,approved_on:approval?.date||null,approval_filed_on:approval?.filed||null,returned_on:events.filter(e=>e.type==='returned').at(-1)?.date||null,processing_days:elapsed};
    }).sort((a,b)=>b.events.at(-1).date.localeCompare(a.events.at(-1).date)||a.kind.localeCompare(b.kind)||b.id-a.id);
    function stats(list){const approvals=list.filter(p=>p.approved_on),completed=approvals.filter(p=>p.processing_days!==null);return {filed:list.filter(p=>p.events.some(e=>e.type==='filed')).length,approved:approvals.length,returned:list.filter(p=>p.returned_on).length,average_days:completed.length?Math.round(completed.reduce((sum,p)=>sum+p.processing_days,0)/completed.length*10)/10:null,completed_with_dates:completed.length,missing_processing_dates:approvals.length-completed.length};}
    const summary=stats(records),breakdown=['permits','occupancy'].filter(wanted).map(kind=>({kind,...stats(records.filter(p=>p.kind===kind))}));
    const weeks=[];for(let start=period.from;start<period.exclusive;start=addDays(start,7)){const end=addDays(start,7)<period.exclusive?addDays(start,7):period.exclusive,list=records.filter(p=>p.filed_on>=start&&p.filed_on<end&&p.events.some(e=>e.type==='filed'));weeks.push({from:start,to:addDays(end,-1),permits:list.filter(p=>p.kind==='permits').length,occupancy:list.filter(p=>p.kind==='occupancy').length,total:list.length});}
    const pages=Math.max(1,Math.ceil(records.length/PAGE_SIZE)),page=Math.min(period.page,pages);
    return {success:true,period:{...period,page:undefined,exclusive:undefined},summary,breakdown,weeks,coverage:{archived_records:records.filter(p=>p.archived).length,invalid_history_dates:invalidHistoryDates},pagination:{page,pages,total:records.length,page_size:PAGE_SIZE},records:records.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),allRecords:records};
}
async function load(conn,period){
    const kinds=period.kind==='all'?['permits','occupancy']:[period.kind],placeholders=kinds.map(()=>'?').join(',');
    async function query(sql,args){const [rows]=await conn.query(sql,args);if(rows.length>MAX_ROWS)throw bad('This report exceeds the safe row limit. Choose one permit type or contact IT.');return rows;}
    const reviews=await query(`SELECT id,kind,project_id,decision,snapshot,CAST(created_at AS DATE) event_on FROM permit_final_reviews WHERE kind IN (${placeholders}) AND decision IN ('approved','returned') AND created_at>=? AND created_at<? ORDER BY created_at,id LIMIT ${MAX_ROWS+1}`,[...kinds,period.from,period.exclusive]);
    const activities=await query(`SELECT kind,project_id,project_title,category,outcome,message,details,CAST(created_at AS DATE) event_on FROM project_records WHERE kind IN (${placeholders}) AND category='activity' AND outcome='saved' AND created_at>=? AND created_at<? AND details LIKE ? ORDER BY id LIMIT ${MAX_ROWS+1}`,[...kinds,period.from,period.exclusive,'%Rejected%']);
    const archiveRows=await query(`SELECT kind,category,outcome,details FROM project_records WHERE kind IN (${placeholders}) AND ((category='bulk_delete' AND outcome='approved') OR (category='activity' AND outcome='saved' AND (message IN ('Deleted permit directly','Deleted permit directly through Delete All') OR details LIKE ?))) ORDER BY id LIMIT ${MAX_ROWS+1}`,[...kinds,'%"deletion"%']);
    const current=[];
    for(const kind of kinds){const building=kind==='permits',table=building?'permits':'occupancy_permits',date=building?'permit_date':'date_applied',ids=[...new Set([...reviews,...activities].filter(r=>r.kind===kind).map(r=>Number(r.project_id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
        const rows=await query(`SELECT id,project_title,owner_name,location,rejection_history,${date},CAST(${date} AS DATE) filing_on FROM ${table} WHERE (${date}>=? AND ${date}<?)${ids.length?' OR id IN (?)':''} OR (rejection_history IS NOT NULL AND rejection_history<>'' AND rejection_history<>'[]') ORDER BY id LIMIT ${MAX_ROWS+1}`,[period.from,period.exclusive,...(ids.length?[ids]:[])]);
        current.push(...rows.map(row=>({...row,kind})));
    }
    return build({current,reviews,activities,archives:archiveRows},period);
}
module.exports=function monthlyReports(open,sessions){
    const router=require('express').Router();router.use(sessions.requireRoles('admin'));
    async function run(req,res,exporting=false){let conn,begun=false;
        try{
            const period=filters(req.query),format=req.query.format||'xlsx';if(exporting&&!['xlsx','csv'].includes(format))throw bad('Choose Excel or CSV export.');
            conn=await open();
            if(conn.dialect!=='postgres')await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            await conn.beginTransaction();begun=true;
            if(conn.dialect==='postgres')await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            const report=await load(conn,period);await conn.commit();begun=false;res.set('Cache-Control','no-store');
            if(!exporting){const {allRecords,...body}=report;return res.json(body);}
            const writer=require('./monthlyReportExport'),base='monthly-permits-'+period.month+'-'+period.kind;
            if(format==='csv')return res.type('text/csv; charset=utf-8').attachment(base+'.csv').send(writer.csv(report));
            return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(base+'.xlsx').send(await writer.excel(report));
        }catch(error){if(begun)await conn.rollback().catch(()=>{});return res.status(error.status||503).json({success:false,message:error.status?error.message:'Monthly reports are unavailable. Please refresh or try again.'});}
        finally{if(conn){if(typeof conn.release==='function')conn.release();else await conn.end();}}
    }
    router.get('/',(req,res)=>run(req,res));router.get('/export',(req,res)=>run(req,res,true));return router;
};
Object.assign(module.exports,{day,filters,archives,build,load,PAGE_SIZE});
