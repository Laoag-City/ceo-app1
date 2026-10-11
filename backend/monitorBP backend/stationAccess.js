const key = name => String(name || '').normalize('NFKC').trim().toUpperCase().replace(/&/g,' AND ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const denied = message => Object.assign(new Error(message),{status:403});
async function assignments(conn,userId,lock=false) {
    const [rows]=await conn.query('SELECT station_key, station_name FROM permit_station_assignments WHERE user_id=? ORDER BY station_key'+(lock?' FOR UPDATE':''),[userId]);
    return rows;
}
async function authorize(conn,user,rows) {
    if(user.role!=='operator')throw denied('Only the designated station operator can edit station details.');
    const assigned=await assignments(conn,user.id,true),allowed=new Set(assigned.map(row=>row.station_key));
    if(!assigned.length || rows.some(row=>!allowed.has(key(row.discipline_name))))throw denied('You can edit only your assigned stations. Ask the IT team to check your station assignments.');
    return assigned;
}
async function displayName(conn,user) {
    const [rows]=await conn.query('SELECT display_name FROM permit_user_profiles WHERE user_id=?',[user.id]);
    return String(rows[0]?.display_name || '').trim() || user.username;
}
async function engineers(conn,stationRows=[]) {
    const [rows]=await conn.query(`SELECT a.station_key,a.user_id,
        COALESCE(NULLIF(TRIM(p.display_name),''),u.username) AS display_name
        FROM permit_station_assignments a INNER JOIN users u ON u.id=a.user_id
        LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.role='operator' ORDER BY a.station_key,u.id`);
    const byStation=new Map();
    for(const row of rows){if(!byStation.has(row.station_key))byStation.set(row.station_key,[]);byStation.get(row.station_key).push({id:Number(row.user_id),display_name:row.display_name});}
    const ids=[...new Set(stationRows.map(row=>Number(row.last_updated_by)).filter(id=>Number.isSafeInteger(id)&&id>0))];
    const [reviewers]=ids.length?await conn.query(`SELECT u.id,COALESCE(NULLIF(TRIM(p.display_name),''),u.username) AS display_name
        FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.id IN (?)`,[ids]):[[]];
    return {assigned:byStation,reviewers:new Map(reviewers.map(row=>[Number(row.id),row]))};
}
function engineer(row,operators) {
    const assigned=operators.assigned.get(key(row.discipline_name)) || [],last=Number(row.last_updated_by) || null;
    // Legacy rows have no recorded reviewer ID. Keep their previous single-operator
    // display until the first real save; never guess an author from a stored name.
    const reviewer=last?operators.reviewers.get(last):assigned.length===1?assigned[0]:null;
    return {...row,engineer_name:reviewer?.display_name || (last || assigned.length>1?row.engineer_name || '':''),assigned_operator_id:reviewer?Number(reviewer.id):null,reviewing_operator_id:last,assigned_operators:assigned,engineer_profile_bound:true};
}
module.exports={key,assignments,authorize,displayName,engineers,engineer};
