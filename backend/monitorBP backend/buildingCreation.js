// Commit the project, lots, sub-permit and standard stations together.
const stations=require('./buildingStations');
const validation=require('./permitValidation');
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function buildingCreation(openConnection,{sanitize=value=>String(value ?? '').trim(),validDate}) {
    return async(req,res)=>{
        let conn;
        try {
            const body=req.body || {},fields=['project_title','location','owner_name','designer_name','permit_date'];
            const data=validation.metadata('permits',body,sanitize);
            const values=fields.map(key=>data[key]);
            const lots=validation.lots(body.lot_numbers,sanitize);
            const subTitle=validation.text('sub_project_title',body.sub_project_title,sanitize,true);
            if(!validDate(values[4]))throw bad('Enter a valid permit date.');
            conn=await openConnection();await conn.beginTransaction();
            const [users]=await conn.query('SELECT id,role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE',[req.user?.id]);
            if(users[0]?.role!=='operator' || req.user?.role!=='operator')throw bad('Only active station operators can create building permits.',403);
            const [record]=await conn.query('INSERT INTO permits (project_title,location,owner_name,designer_name,permit_date) VALUES (?,?,?,?,?)',values);
            for(const lot of lots)await conn.query('INSERT INTO permit_lots (permit_id,lot_number) VALUES (?,?)',[record.insertId,lot]);
            await stations.seed(conn,record.insertId);
            if(subTitle) {
                const [sub]=await conn.query('INSERT INTO sub_permits (permit_id,sub_project_title) VALUES (?,?)',[record.insertId,subTitle]);
                await stations.seed(conn,record.insertId,sub.insertId);
            }
            await conn.commit();res.locals=res.locals || {};res.locals.projectRecordId=record.insertId;
            return res.json({success:true,id:record.insertId,message:'Building permit recorded with standard routing stations.'});
        } catch(error) {
            if(conn)await conn.rollback().catch(()=>{});
            return res.status(error.status || 500).json({success:false,message:error.status?error.message:'The building permit could not be created. No project or stations were saved. Please try again.'});
        } finally {if(conn)await conn.end();}
    };
};
