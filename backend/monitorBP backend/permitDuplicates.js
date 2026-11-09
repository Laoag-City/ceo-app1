// Advisory matches, not uniqueness rules: one property can have several permits.
const crypto=require('node:crypto');
const tables={permits:'permits',occupancy:'occupancy_permits'};
const normalize=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function lock(conn,kind) {
    if(!tables[kind])throw Error('Unknown permit registry.');
    if(conn.dialect==='postgres') {
        await conn.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ?,0))",[':permit-duplicates:'+kind]);
        return async()=>{};
    }
    const [[row]]=await conn.query('SELECT GET_LOCK(CONCAT(DATABASE(),?),10) acquired',[':permit-duplicates:'+kind]);
    if(Number(row.acquired)!==1)throw Object.assign(Error('Another permit save is running. Please try again.'),{status:409});
    return async()=>{await conn.query('SELECT RELEASE_LOCK(CONCAT(DATABASE(),?))',[':permit-duplicates:'+kind]);};
}
async function candidates(conn,kind) {
    if(!tables[kind])throw Error('Unknown permit registry.');
    const [rows]=await conn.query(`SELECT id,project_title,owner_name,location${kind==='occupancy'?',bp_reference_no':''} FROM ${tables[kind]} ORDER BY id`);
    if(kind==='permits') {
        const [lots]=await conn.query('SELECT permit_id,lot_number FROM permit_lots ORDER BY id');
        const byId=new Map();
        for(const row of lots){if(!byId.has(Number(row.permit_id)))byId.set(Number(row.permit_id),[]);byId.get(Number(row.permit_id)).push(row.lot_number);}
        return rows.map(row=>({...row,lot_numbers:byId.get(Number(row.id))||[]}));
    }
    return rows;
}
function compare(kind,data,existing,excludeId) {
    const title=normalize(data.project_title),owner=normalize(data.owner_name),location=normalize(data.location),reference=normalize(data.bp_reference_no);
    const lots=new Set((Array.isArray(data.lot_numbers)?data.lot_numbers:String(data.lot_numbers||'').split('|')).map(normalize).filter(Boolean));
    const matches=[];
    for(const row of existing) {
        if(Number(row.id)===Number(excludeId))continue;
        const reasons=[],sameOwner=!!owner&&owner===normalize(row.owner_name),sameLocation=!!location&&location===normalize(row.location);
        if(title&&title===normalize(row.project_title))reasons.push('Same project title');
        if(sameOwner&&sameLocation)reasons.push('Same owner and location');
        if(kind==='occupancy'&&reference&&reference===normalize(row.bp_reference_no))reasons.push('Same building permit reference');
        if(kind==='permits'&&(sameOwner||sameLocation)&&(row.lot_numbers||[]).some(lot=>lots.has(normalize(lot))))reasons.push('Matching lot number and '+(sameOwner?'owner':'location'));
        if(reasons.length)matches.push({id:Number(row.id),reference:(kind==='permits'?'BP-':'OP-')+row.id,project_title:row.project_title,
            owner_name:row.owner_name,location:row.location,...(kind==='occupancy'?{bp_reference_no:row.bp_reference_no}:{}),reasons});
    }
    return {kind,matches:matches.slice(0,10),total:matches.length,version:hash([kind,data,matches])};
}
async function check(conn,kind,data,ack={},excludeId) {
    const result=compare(kind,data,await candidates(conn,kind),excludeId);
    if(!result.total)return null;
    if(ack.allowDuplicates===true&&ack.duplicateVersion===result.version)return {version:result.version,references:result.matches.map(row=>row.reference),total:result.total};
    throw Object.assign(Error('Possible existing permits were found. Review the matches before saving.'),{status:409,code:'POSSIBLE_DUPLICATE',possibleDuplicates:result});
}
function response(error) {
    return error.code==='POSSIBLE_DUPLICATE'?{code:error.code,possibleDuplicates:error.possibleDuplicates}:{};
}
function acknowledge(res,value) {if(value){res.locals=res.locals||{};res.locals.duplicateAcknowledgement=value;}}
module.exports={normalize,hash,lock,candidates,compare,check,response,acknowledge};
