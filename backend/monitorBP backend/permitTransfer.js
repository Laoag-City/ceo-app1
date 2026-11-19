/** CSV transfer: explicit field allowlists, preview before transactional creation,
 * and durable batch keys. Never accepts spreadsheet IDs/status as write fields.
 * A dedicated connection owns each transaction and named import lock.
 */
const crypto = require('node:crypto');
const express = require('express');
const occupancyStations = require('./occupancyStations');
const duplicateChecks=require('./permitDuplicates');
const fields = {
    permits: ['project_title','location','owner_name','designer_name','permit_date','lot_numbers','phone_number','email'],
    occupancy: ['project_title','location','owner_name','bp_reference_no','date_applied','phone_number','email']
};
const tables = {permits:'permits',occupancy:'occupancy_permits'};
const bad = (message,status=400) => Object.assign(new Error(message),{status});
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = duplicateChecks.normalize;
// Quoting alone does not stop spreadsheet formula execution.
function csv(rows) {
    return '\uFEFF' + rows.map(row => row.map(value => {
        let text = String(value ?? '');
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g,'""') + '"';
    }).join(',')).join('\r\n');
}
function parse(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 80000) throw bad('Use a UTF-8 CSV file up to 80 KB.');
    text = text.replace(/^\uFEFF/,'');
    const rows=[]; let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++) {
        const c=text[i];
        if(quoted) { if(c==='"') { if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;} }else value+=c; continue; }
        if(c===',' || c==='\r' || c==='\n') {
            row.push(value);value='';closed=false;
            if(c!==',') { if(c==='\r'&&text[i+1]==='\n')i++; if(row.some(v=>v.trim()))rows.push(row);row=[]; }
        } else if(c==='"' && !value && !closed) quoted=true;
        else { if(closed || c==='"')throw bad('Malformed CSV quoting. Save the file as CSV UTF-8.');value+=c; }
        if(rows.length>101)throw bad('Import at most 100 records per file.');
    }
    if(quoted)throw bad('Unclosed quote in CSV.');
    row.push(value);if(row.some(v=>v.trim()))rows.push(row);
    return rows;
}
function validate(kind,text) {
    const rows=parse(text),headers=rows.shift()?.map(v=>v.trim());
    const expected=fields[kind];
    if(!expected)throw bad('Unknown permit type.');
    const legacy=expected.filter(f=>!['phone_number','email'].includes(f));
    if(!headers || ![expected,legacy].some(list=>headers.length===list.length && new Set(headers).size===headers.length && list.every(f=>headers.includes(f))))throw bad('Columns must match the selected template exactly. Export files are reports; use the import template.');
    if(!rows.length || rows.length>100)throw bad('Include between 1 and 100 records.');
    return rows.map((values,index)=>{
        const data=Object.fromEntries(expected.map(f=>[f,(values[headers.indexOf(f)]||'').trim()]));
        const errors=[];
        if(values.length!==headers.length)errors.push('Incorrect number of columns');
        for(const f of expected) {
            const v=data[f];
            if(!v && !['phone_number','email'].includes(f))errors.push(f+' is required');
            if(/[<>]/.test(v))errors.push(f+' must be plain text without angle brackets');
            if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))errors.push(f+' contains control characters');
            if(f!=='lot_numbers' && Array.from(v).length>(f==='bp_reference_no'?100:f==='phone_number'?50:255))errors.push(f+' is too long');
            if(f==='email' && v && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v))errors.push('email must be a valid email address');
            if(f==='phone_number' && v && (!/^[+()0-9 .-]{7,50}$/.test(v)||(v.match(/\d/g)||[]).length<7))errors.push('phone_number must be a valid phone number');
            if(f.endsWith('_date') || f==='date_applied') {
                const date=new Date(v+'T00:00:00Z');
                if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v||v<'1000-01-01')errors.push(f+' must be a real date in YYYY-MM-DD format');
            }
        }
        if(kind==='permits') {
            const lots=data.lot_numbers.split('|').map(v=>v.trim());
            if(lots.length>30 || lots.some(v=>!v||Array.from(v).length>100)||new Set(lots.map(normalize)).size!==lots.length)errors.push('Use 1–30 distinct lot numbers, separated by | (100 characters each)');
        }
        return {row:index+2,data,errors,duplicates:[]};
    });
}
const schema = `CREATE TABLE IF NOT EXISTS permit_import_batches (
    request_id CHAR(36) PRIMARY KEY, actor_id INT NOT NULL, kind VARCHAR(16) NOT NULL,
    content_hash CHAR(64) NOT NULL, project_ids JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB`;
module.exports = function createTransfer(connect,sessions) {
    const router=express.Router();
    router.use(sessions.requireRoles('operator','admin','superadmin'));
    const wrap=fn=>async(req,res)=>{let db;try {db=await connect();await fn(req,res,db);}catch(e){res.status(e.status||503).json({success:false,message:e.status?e.message:'Transfer failed. Nothing was partially imported. You can retry the same submission.'});}finally{if(db)await db.end();}};
    async function preview(db,kind,text) {
        const rows=validate(kind,text);
        const existing=await duplicateChecks.candidates(db,kind);
        const seen=new Map();
        for(const row of rows) {
            const key=normalize(row.data.project_title);
            const matches=duplicateChecks.compare(kind,row.data,existing);
            row.duplicates=matches.matches.map(p=>p.reference);
            row.duplicateVersion=matches.version;
            row.duplicateTotal=matches.total;
            if(seen.has(key))row.errors.push('Repeated project name within file (row '+seen.get(key)+')');
            seen.set(key,row.row);
        }
        return {rows,version:digest(rows),valid:rows.every(r=>!r.errors.length)};
    }
    router.param('kind',(req,res,next,kind)=>fields[kind]?next():res.status(400).json({message:'Unknown permit type.'}));
    router.get('/:kind/template',(req,res)=>res.type('text/csv').attachment(req.params.kind+'-template.csv').send(csv([fields[req.params.kind]])));
    router.post('/:kind/export',wrap(async(req,res,db)=>{
        const kind=req.params.kind, ids=req.body.ids;
        const format=req.body.format || 'csv';
        if(!['csv','xlsx'].includes(format))throw bad('Choose CSV or Excel export.');
        if(!Array.isArray(ids)||ids.length>10000||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw bad('Select at most 10,000 filtered records per export.');
        const [records]=ids.length?await db.query(`SELECT * FROM ${tables[kind]} WHERE id IN (?)`,[ids]):[[]];
        const finalStatuses=new Map((await require('./finalApproval').projectList(db,kind)).map(p=>[Number(p.id),p.final_approval.label]));
        let lots=[];if(kind==='permits')[lots]=await db.query('SELECT permit_id,lot_number FROM permit_lots ORDER BY id');
        const byId=new Map(records.map(p=>[p.id,p]));
        const result=ids.filter(id=>byId.has(id)).map(id=>{
            const p=byId.get(id);
            const status=finalStatuses.get(Number(id)) || 'Station review in progress';
            p.lot_numbers=lots.filter(l=>l.permit_id===id).map(l=>l.lot_number).join(' | ');
            return [(kind==='permits'?'BP-':'OP-')+String(id),...fields[kind].map(f=>p[f]),status];
        });
        const headers=['project_id',...fields[kind],'status'];
        if(format==='xlsx') {
            const buffer=await require('./permitWorkbook')(kind,headers,result);
            return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(kind+'-export.xlsx').send(buffer);
        }
        res.type('text/csv').attachment(kind+'-export.csv').send(csv([headers,...result]));
    }));
    router.post('/:kind/preview',sessions.requireRoles('admin'),wrap(async(req,res,db)=>res.json(await preview(db,req.params.kind,req.body.csv))));
    router.post('/:kind/import',sessions.requireRoles('admin'),wrap(async(req,res,db)=>{
        const kind=req.params.kind,{requestId,csv:text,version,allowDuplicates}=req.body;
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId||''))throw bad('Invalid submission ID.');
        validate(kind,text);
        const hash=digest({kind,text,version,allowDuplicates:allowDuplicates===true});
        // Serializes imports per database, including duplicate checks and batch retries.
        if(db.dialect!=='postgres') {
            const [lock]=await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':permit-import'),10) acquired");
            if(!lock[0].acquired)throw bad('Another import is running. Try again shortly.',409);
        }
        let unlock;
        try {
            await db.beginTransaction();
            unlock=await duplicateChecks.lock(db,kind);
            if(db.dialect==='postgres')await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':permit-import',0))");
            const [prior]=await db.query('SELECT * FROM permit_import_batches WHERE request_id=?',[requestId]);
            if(prior.length) {
                if(prior[0].actor_id!==req.user.id||prior[0].content_hash!==hash)throw bad('This submission ID was already used.',409);
                await db.commit();return res.json({success:true,replayed:true,ids:typeof prior[0].project_ids==='string'?JSON.parse(prior[0].project_ids):prior[0].project_ids});
            }
            const checked=await preview(db,kind,text);
            if(!checked.valid)throw bad('Correct the invalid rows before importing.');
            if(checked.version!==version)throw bad('Records changed since preview. Preview the file again before importing.',409);
            if(checked.rows.some(r=>r.duplicates.length)&&allowDuplicates!==true)throw bad('Review and acknowledge the possible duplicates first.');
            const ids=[];
            for(const {data} of checked.rows) {
                const columns=fields[kind].filter(f=>f!=='lot_numbers');
                const [insert]=await db.query(`INSERT INTO ${tables[kind]} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(f=>data[f]));
                ids.push(insert.insertId);
                if(kind==='permits') {
                    for(const lot of data.lot_numbers.split('|'))await db.query('INSERT INTO permit_lots (permit_id,lot_number) VALUES (?,?)',[insert.insertId,lot.trim()]);
                    await require('./buildingStations').seed(db,insert.insertId);
                } else await occupancyStations.seed(db,insert.insertId);
            }
            await db.query('INSERT INTO permit_import_batches (request_id,actor_id,kind,content_hash,project_ids) VALUES (?,?,?,?,?)',[requestId,req.user.id,kind,hash,JSON.stringify(ids)]);
            await db.commit();res.json({success:true,ids});
        }catch(e){await db.rollback();throw e;}finally{try{if(unlock)await unlock();}finally{if(db.dialect!=='postgres')await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':permit-import'))");}}
    }));
    return {router,initialize:async()=>{const db=await connect();try{await db.query(schema);}finally{await db.end();}}};
};
module.exports.csv=csv;
module.exports.validate=validate;
module.exports.schema=schema;
