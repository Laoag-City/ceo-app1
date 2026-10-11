const express=require('express'),bcrypt=require('bcryptjs'),passwordPolicy=require('./passwordPolicy'),stations=require('./stationAccess');
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function(openConnection,sessions){
    const router=express.Router();router.use(sessions.requireRoles('superadmin'));
    function transaction(operation){return async(req,res)=>{
        let conn;
        try {
            conn=await openConnection();await conn.beginTransaction();
            const [actors]=await conn.query('SELECT id, role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE',[req.user.id]);
            if(actors[0]?.role!=='superadmin')throw bad('Only the IT team can manage accounts.',403);
            const body=await operation(conn,req);await conn.commit();res.json(body || {success:true});
        }catch(error){if(conn)await conn.rollback().catch(()=>{});res.status(error.status || (['23505','ER_DUP_ENTRY'].includes(error.code)?409:503)).json({success:false,message:error.status?error.message:['23505','ER_DUP_ENTRY'].includes(error.code)?'That username or assignment already exists. Refresh before retrying.':'Account changes could not be saved. Please retry.'});}
        finally{if(conn)await conn.end();}
    };}
    async function target(conn,req){
        const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw bad('Invalid account ID.');
        const [users]=await conn.query('SELECT id,role,is_active,is_verified FROM users WHERE id=? FOR UPDATE',[id]);
        if(!users[0])throw bad('Account not found.',404);return users[0];
    }
    router.get('/stations',transaction(async conn=>{
        const [building]=await conn.query('SELECT DISTINCT discipline_name FROM permit_routing_matrix');
        const [occupancy]=await conn.query('SELECT DISTINCT discipline_name FROM occupancy_routing_matrix');
        const defaults=['Office of the Building Official','Land Use and Zoning','Architectural','Structural','Line and Grade','Sanitary','Electrical','Mechanical','CINSP BFP City Fire Marshal','Civil / Structural','Plumbing','Electronics','Fire Safety'];
        const catalog=new Map();for(const name of [...building,...occupancy].map(r=>r.discipline_name).concat(defaults))if(stations.key(name))catalog.set(stations.key(name),String(name));
        return {success:true,stations:[...catalog.values()].sort((a,b)=>a.localeCompare(b))};
    }));
    async function saveStations(conn,req,names){
        const user=await target(conn,req);
        if(user.role!=='operator')throw bad('Only operator accounts can have a station assignment.');
        if(!Array.isArray(names)||names.length>100)throw bad('Choose a list of up to 100 stations.');
        const selected=new Map();
        for(const value of names){
            if(typeof value!=='string')throw bad('Enter a valid station name within 100 characters.');
            const name=value.trim(),stationKey=stations.key(name);
            if(!name||!stationKey||name.length>100||stationKey.length>120)throw bad('Enter a valid station name within 100 characters.');
            if(!selected.has(stationKey))selected.set(stationKey,name);
        }
        const current=await stations.assignments(conn,user.id,true);
        if(current.length===selected.size&&current.every(row=>selected.has(row.station_key)))return {success:true,unchanged:true,message:'Station assignments are unchanged.'};
        await conn.query('DELETE FROM permit_station_assignments WHERE user_id=?',[user.id]);
        for(const [stationKey,name] of selected)await conn.query('INSERT INTO permit_station_assignments (user_id,station_key,station_name) VALUES (?,?,?)',[user.id,stationKey,name]);
        return {success:true,message:selected.size?'Station assignments saved.':'Station assignments cleared.'};
    }
    router.put('/accounts/:id/stations',transaction((conn,req)=>saveStations(conn,req,req.body?.stations)));
    router.put('/accounts/:id/station',transaction(async(conn,req)=>{
        // Old clients may still send one selection. Never silently erase a new multi-station assignment.
        if(typeof req.body?.station!=='string')throw bad('Choose a station.');
        if((await stations.assignments(conn,Number(req.params.id))).length>1)throw bad('Refresh User Management to edit multiple station assignments.',409);
        return saveStations(conn,req,req.body.station.trim()?[req.body.station]:[]);
    }));
    router.put('/accounts/:id/role',transaction(async(conn,req)=>{
        const user=await target(conn,req),role=String(req.body.role || '').trim().toLowerCase();
        if(!['operator','admin','superadmin'].includes(role))throw bad('Invalid role.');
        if(user.id===req.user.id && role!=='superadmin')throw bad('You cannot remove your own IT access.');
        if(role===user.role)return {success:true,unchanged:true};
        await conn.query('UPDATE users SET role=? WHERE id=?',[role,user.id]);
        await conn.query('DELETE FROM permit_station_assignments WHERE user_id=?',[user.id]);
        await conn.query('DELETE FROM permit_sessions WHERE user_id=?',[user.id]);
        return {success:true,message:'Role saved. The account must sign in again.'};
    }));
    router.put('/accounts/:id/active',transaction(async(conn,req)=>{
        const user=await target(conn,req);if(typeof req.body.active!=='boolean')throw bad('Choose active or inactive.');
        if(user.id===req.user.id && !req.body.active)throw bad('You cannot deactivate your own account.');
        await conn.query('UPDATE users SET is_active=?,is_verified=1 WHERE id=?',[req.body.active?1:0,user.id]);
        if(!req.body.active)await conn.query('DELETE FROM permit_sessions WHERE user_id=?',[user.id]);
        return {success:true,message:req.body.active?'Account activated.':'Account deactivated.'};
    }));
    router.post('/accounts',transaction(async(conn,req)=>{
        const username=typeof req.body.username==='string'?req.body.username.trim():'',password=req.body.password,role=req.body.role;
        if(!username || username.length>50 || typeof password!=='string' || !['operator','admin','superadmin'].includes(role))throw bad('Enter a username, password, and valid role.');
        const error=passwordPolicy(password);if(error)throw bad(error);
        await conn.query('INSERT INTO users (username,password,role,is_verified,is_active) VALUES (?,?,?,1,1)',[username,await bcrypt.hash(password,10),role]);
        return {success:true,message:'Account created. Assign a station before an operator edits routing details.'};
    }));
    return router;
};
