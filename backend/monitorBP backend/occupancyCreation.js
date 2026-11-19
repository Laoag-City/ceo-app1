// The project and its standard routing rows commit together or not at all.
const stations=require('./occupancyStations');
const validation=require('./permitValidation');
const processing=require('./permitProcessing');
const {officeToday}=require('./permitAging');
const duplicates=require('./permitDuplicates'),requests=require('./permitCreationRequests');
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function occupancyCreation(openConnection,{sanitize=value=>String(value ?? '').trim(),validDate}) {
    return async(req,res)=>{
        let conn,unlock;
        try {
            const body=req.body || {};
            const data=validation.metadata('occupancy',body,sanitize);
            const classification=processing.creationFields(body);
            const content={...data,...classification};
            const requestId=requests.key(body);
            if(!validDate(data.date_applied))throw bad('Enter a valid date applied.');
            conn=await openConnection();await conn.beginTransaction();
            unlock=await duplicates.lock(conn,'occupancy');
            const [users]=await conn.query('SELECT id,role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE',[req.user?.id]);
            if(users[0]?.role!=='operator' || req.user?.role!=='operator')throw bad('Only active station operators can create occupancy permits.',403);
            const prior=await requests.prior(conn,req.user.id,requestId,'occupancy',content);
            if(prior){await conn.commit();return res.json({success:true,duplicate:true,replayed:true,id:prior,message:'This submission was already saved. No second permit was created.'});}
            duplicates.acknowledge(res,await duplicates.check(conn,'occupancy',data,body));
            const insert={...data};
            if(classification.processing_time)Object.assign(insert,classification,{processing_started_on:officeToday()});
            const columns=Object.keys(insert);
            const [record]=await conn.query(`INSERT INTO occupancy_permits (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(key=>insert[key]));
            await stations.seed(conn,record.insertId);
            await requests.save(conn,req.user.id,requestId,'occupancy',content,record.insertId);
            await conn.commit();
            res.locals=res.locals || {};res.locals.projectRecordId=record.insertId;
            return res.json({success:true,id:record.insertId,station_count:stations.defaults.length,message:'Occupancy permit recorded with standard routing stations.'});
        } catch(error) {
            if(conn)await conn.rollback().catch(()=>{});
            return res.status(error.status || 500).json({success:false,...duplicates.response(error),message:error.status?error.message:'The occupancy permit could not be created. No project or stations were saved. Please try again.'});
        } finally {try{if(unlock)await unlock();}finally{if(conn)await conn.end();}}
    };
};
