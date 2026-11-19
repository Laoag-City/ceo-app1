// Commit the project, lots, sub-permit and standard stations together.
const stations=require('./buildingStations');
const validation=require('./permitValidation');
const processing=require('./permitProcessing');
const {officeToday}=require('./permitAging');
const duplicates=require('./permitDuplicates'),requests=require('./permitCreationRequests');
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function buildingCreation(openConnection,{sanitize=value=>String(value ?? '').trim(),validDate}) {
    return async(req,res)=>{
        let conn,unlock;
        try {
            const body=req.body || {};
            const data=validation.metadata('permits',body,sanitize);
            const classification=processing.creationFields(body);
            const lots=validation.lots(body.lot_numbers,sanitize);
            const subTitle=validation.text('sub_project_title',body.sub_project_title,sanitize,true);
            const requestId=requests.key(body),content={...data,...classification,lot_numbers:lots,sub_project_title:subTitle};
            if(!validDate(data.permit_date))throw bad('Enter a valid permit date.');
            conn=await openConnection();await conn.beginTransaction();
            unlock=await duplicates.lock(conn,'permits');
            const [users]=await conn.query('SELECT id,role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE',[req.user?.id]);
            if(users[0]?.role!=='operator' || req.user?.role!=='operator')throw bad('Only active station operators can create building permits.',403);
            const prior=await requests.prior(conn,req.user.id,requestId,'permits',content);
            if(prior){await conn.commit();return res.json({success:true,duplicate:true,replayed:true,id:prior,message:'This submission was already saved. No second permit was created.'});}
            duplicates.acknowledge(res,await duplicates.check(conn,'permits',content,body));
            const insert={...data};
            if(classification.processing_time)Object.assign(insert,classification,{processing_started_on:officeToday()});
            const columns=Object.keys(insert);
            const [record]=await conn.query(`INSERT INTO permits (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(key=>insert[key]));
            for(const lot of lots)await conn.query('INSERT INTO permit_lots (permit_id,lot_number) VALUES (?,?)',[record.insertId,lot]);
            await stations.seed(conn,record.insertId);
            if(subTitle) {
                const [sub]=await conn.query('INSERT INTO sub_permits (permit_id,sub_project_title) VALUES (?,?)',[record.insertId,subTitle]);
                await stations.seed(conn,record.insertId,sub.insertId);
            }
            await requests.save(conn,req.user.id,requestId,'permits',content,record.insertId);
            await conn.commit();res.locals=res.locals || {};res.locals.projectRecordId=record.insertId;
            return res.json({success:true,id:record.insertId,message:'Building permit recorded with standard routing stations.'});
        } catch(error) {
            if(conn)await conn.rollback().catch(()=>{});
            return res.status(error.status || 500).json({success:false,...duplicates.response(error),message:error.status?error.message:'The building permit could not be created. No project or stations were saved. Please try again.'});
        } finally {try{if(unlock)await unlock();}finally{if(conn)await conn.end();}}
    };
};
