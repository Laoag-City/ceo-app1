// Replace the two single-assignment unique keys atomically, keeping every existing row.
module.exports=async db=>{
    const [rows]=await db.query('SHOW INDEX FROM permit_station_assignments');
    const indexes=new Map();
    for(const row of rows){if(!indexes.has(row.Key_name))indexes.set(row.Key_name,[]);indexes.get(row.Key_name).push(row);}
    const changes=[];let hasPrimary=indexes.has('PRIMARY'),hasStationIndex=false;
    for(const [name,parts] of indexes){
        parts.sort((a,b)=>a.Seq_in_index-b.Seq_in_index);
        const columns=parts.map(part=>part.Column_name);
        if(!Number(parts[0].Non_unique) && columns.length===1 && ['user_id','station_key'].includes(columns[0])){
            changes.push(name==='PRIMARY'?'DROP PRIMARY KEY':'DROP INDEX `'+name.replace(/`/g,'``')+'`');
            if(name==='PRIMARY')hasPrimary=false;
        }else if(columns[0]==='station_key')hasStationIndex=true;
    }
    if(!hasPrimary)changes.push('ADD PRIMARY KEY (user_id,station_key)');
    if(!hasStationIndex)changes.push('ADD INDEX station_assignment_station (station_key)');
    if(changes.length)await db.query('ALTER TABLE permit_station_assignments '+changes.join(', '));
    for(const table of ['permit_routing_matrix','occupancy_routing_matrix']){
        const [columns]=await db.query(`SHOW COLUMNS FROM ${table} LIKE 'last_updated_by'`);
        if(!columns.length)await db.query(`ALTER TABLE ${table} ADD COLUMN last_updated_by INT NULL`);
    }
};
