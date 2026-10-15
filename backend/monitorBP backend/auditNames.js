// Resolve legacy reviewer IDs/usernames for display without rewriting audit rows.
module.exports=async function auditNames(query,values){
    const names=[...new Set(values.filter(value=>value!=null&&String(value).trim()).map(value=>String(value).trim()))];
    if(!names.length)return value=>value || '';
    const ids=names.filter(value=>/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))).map(Number);
    const rows=await query(`SELECT u.id,u.username,COALESCE(NULLIF(TRIM(p.display_name),''),u.username) AS display_name
        FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.id IN (?) OR u.username IN (?)`,[ids.length?ids:[0],names]);
    const byId=new Map(rows.map(row=>[String(row.id),row.display_name])),byUsername=new Map(rows.map(row=>[row.username,row.display_name]));
    return (value,id)=>byId.get(String(id ?? value).trim()) || byUsername.get(String(value).trim()) || value || '';
};
