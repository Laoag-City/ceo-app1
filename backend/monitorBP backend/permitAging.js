// Read-only follow-up indicators. Calendar days are counted in the office's time zone.
// These trial thresholds are operational reminders, not statutory processing deadlines.
const DAY=86400000;
function policyFromEnv(env={}) {
    const read=(key,fallback)=>{
        if(env[key]===undefined || env[key]==='')return fallback;
        if(!/^\d+$/.test(String(env[key])) || Number(env[key])<1 || Number(env[key])>3650)throw Error(key+' must be a whole number from 1 to 3650.');
        return Number(env[key]);
    };
    const followup_days=read('PERMIT_AGING_FOLLOWUP_DAYS',14),overdue_days=read('PERMIT_AGING_OVERDUE_DAYS',30);
    if(overdue_days<=followup_days)throw Error('PERMIT_AGING_OVERDUE_DAYS must exceed PERMIT_AGING_FOLLOWUP_DAYS.');
    return {followup_days,overdue_days};
}
const policy=policyFromEnv(process.env);
function calendar(value) {
    // PostgreSQL DATE values can arrive as local-midnight Date objects. Keep their
    // calendar fields, rather than converting them to an earlier UTC day.
    const key=value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : String(value??'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
    const parsed=new Date(key+'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===key ? key : null;
}
function officeToday(now=new Date()) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=type=>parts.find(p=>p.type===type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
const elapsed=(from,to)=>Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/DAY);
function summarize(record,kind,lastActivity,{today=officeToday(),thresholds=policy}={}) {
    if(!['permits','occupancy'].includes(kind))throw Error('Unknown permit registry.');
    if(!calendar(today))throw Error('Expected a valid office calendar date.');
    const filed=calendar(kind==='permits'?record.permit_date:record.date_applied),activity=calendar(lastActivity);
    const result={as_of:today,age_days:filed&&filed<=today?elapsed(filed,today):null,inactive_days:null,last_activity_date:activity,basis:activity?'activity':'filing',...thresholds};
    if(record.final_approval?.status==='approved')return {...result,status:'completed',label:'Finally approved'};
    if(!filed || filed>today || (activity && activity>today))return {...result,status:'unknown',label:filed>today || activity>today?'Check future date':'Date unavailable'};
    const since=activity && activity>=filed?activity:filed;
    result.basis=since===activity?'activity':'filing';
    result.inactive_days=elapsed(since,today);
    const status=result.inactive_days>=thresholds.overdue_days?'overdue':result.inactive_days>=thresholds.followup_days?'followup':'normal';
    return {...result,status,label:({overdue:'Overdue',followup:'Follow-up due',normal:'Within threshold'})[status]};
}
async function decorate(conn,kind,records,options) {
    if(!['permits','occupancy'].includes(kind))throw Error('Unknown permit registry.');
    if(!records.length)return [];
    // One grouped query per registry. Comments, rejected writes, retry replays and
    // interrupted/unconfirmed intents cannot make an idle permit look active.
    const [rows]=await conn.query(`SELECT project_id,CAST(MAX(created_at) AS DATE) AS last_activity_date
        FROM project_records WHERE kind=? AND category='activity' AND outcome='saved'
        AND project_id IS NOT NULL GROUP BY project_id`,[kind]);
    const dates=new Map(rows.map(row=>[Number(row.project_id),row.last_activity_date]));
    const settings={...options,today:options?.today || officeToday()};
    return records.map(record=>({...record,aging:summarize(record,kind,dates.get(Number(record.id)),settings)}));
}
module.exports={policyFromEnv,calendar,officeToday,summarize,decorate};
