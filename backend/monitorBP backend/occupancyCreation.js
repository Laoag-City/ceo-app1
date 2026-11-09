// The project and its standard routing rows commit together or not at all.
const stations=require('./occupancyStations');
const validation=require('./permitValidation');
const duplicates=require('./permitDuplicates'),requests=require('./permitCreationRequests');
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function occupancyCreation(openConnection,{sanitize=value=>String(value ?? '').trim(),validDate}) {
    return async(req,res)=>{
        let conn,unlock;
        try {
            const body=req.body || {};
            const fields=['bp_reference_no','project_title','location','owner_name','date_applied'];
            const data=validation.metadata('occupancy',body,sanitize);
            const values=fields.map(key=>data[key]);
            const requestId=requests.key(body);
            if(!validDate(values[4]))throw bad('Enter a valid date applied.');
            conn=await openConnection();await conn.beginTransaction();
            unlock=await duplicates.lock(conn,'occupancy');
            const [users]=await conn.query('SELECT id,role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE',[req.user?.id]);
            if(users[0]?.role!=='operator' || req.user?.role!=='operator')throw bad('Only active station operators can create occupancy permits.',403);
            const prior=await requests.prior(conn,req.user.id,requestId,'occupancy',data);
            if(prior){await conn.commit();return res.json({success:true,duplicate:true,replayed:true,id:prior,message:'This submission was already saved. No second permit was created.'});}
            duplicates.acknowledge(res,await duplicates.check(conn,'occupancy',data,body));
            const [record]=await conn.query('INSERT INTO occupancy_permits (bp_reference_no,project_title,location,owner_name,date_applied) VALUES (?,?,?,?,?)',values);
            await stations.seed(conn,record.insertId);
            await requests.save(conn,req.user.id,requestId,'occupancy',data,record.insertId);
            await conn.commit();
            res.locals=res.locals || {};res.locals.projectRecordId=record.insertId;
            return res.json({success:true,id:record.insertId,station_count:stations.defaults.length,message:'Occupancy permit recorded with standard routing stations.'});
        } catch(error) {
            if(conn)await conn.rollback().catch(()=>{});
            return res.status(error.status || 500).json({success:false,...duplicates.response(error),message:error.status?error.message:'The occupancy permit could not be created. No project or stations were saved. Please try again.'});
        } finally {try{if(unlock)await unlock();}finally{if(conn)await conn.end();}}
    };
};
