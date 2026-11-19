const {officeToday,calendar}=require('./permitAging');

const categories={
    simple:{label:'Simple',days:3},
    complex:{label:'Complex',days:7},
    highly_technical:{label:'Highly Technical',days:20}
};
const tables=['permits','occupancy_permits'];
const columns=['processing_time','processing_started_on'];
const dayMs=86400000;

function creationFields(body) {
    if(body.processing_time===undefined)return {};
    const category=body.processing_time;
    if(typeof category!=='string' || !Object.hasOwn(categories,category)) {
        throw Object.assign(new Error('Choose a valid Processing Time.'),{status:400});
    }
    return {processing_time:category};
}

function weekday(day) {
    const number=new Date(day*dayMs).getUTCDay();
    return number!==0 && number!==6;
}
const dayNumber=value=>Math.floor(Date.parse(value+'T00:00:00Z')/dayMs);
const calendarDate=day=>new Date(day*dayMs).toISOString().slice(0,10);

function workingDaysBetween(start,end) {
    if(end<=start)return 0;
    const fullWeeks=Math.floor((end-start)/7);
    let count=fullWeeks*5;
    for(let day=start+fullWeeks*7+1;day<=end;day++)if(weekday(day))count++;
    return count;
}

function summarize(record,finalApproval,now=new Date()) {
    const category=Object.hasOwn(categories,record.processing_time)?categories[record.processing_time]:null;
    if(!category)return null;
    const startDate=calendar(record.processing_started_on);
    const result={category:category.label,working_days:category.days};
    if(!startDate)return result;
    const start=dayNumber(startDate);
    let due=start;
    for(let remaining=category.days;remaining>0;) {
        if(weekday(++due))remaining--;
    }
    const approvedAt=finalApproval?.status==='approved' && finalApproval.history?.find(review=>review.current)?.created_at;
    const approvalDate=approvedAt?new Date(approvedAt):null;
    const completed=approvalDate && Number.isFinite(approvalDate.getTime());
    const asOf=dayNumber(officeToday(completed?approvalDate:now));
    return {
        ...result,due_on:calendarDate(due),
        remaining_working_days:workingDaysBetween(Math.max(start,asOf),due),
        overdue_working_days:workingDaysBetween(due,asOf),
        status:completed?(asOf>due?'completed_late':'completed'):asOf>due?'overdue':asOf===due?'due_today':'open'
    };
}

async function ensureColumns(db) {
    for(const table of tables) {
        if(db.dialect==='postgres') {
            await db.query(`SELECT processing_time,processing_started_on FROM ${table} LIMIT 0`);
        } else {
            for(const [name,type] of [['processing_time','VARCHAR(20)'],['processing_started_on','DATE']]) {
                const [existing]=await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[name]);
                if(!existing.length)await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type} NULL`);
            }
        }
    }
}

// Older requests hashed the permit before these columns existed.
function omitUnset(record) {
    for(const key of columns)if(record[key]==null)delete record[key];
    return record;
}

module.exports={creationFields,summarize,ensureColumns,omitUnset};
