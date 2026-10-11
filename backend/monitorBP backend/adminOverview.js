/** Read-only dashboard projection. Session role checks stay on the server;
 * account totals are returned only to superadministrators. */
module.exports=function adminOverview(db,sessions) {
    const router=require('express').Router();
    const query=async(sql,args=[]) => (await db.promise().query(sql,args))[0];
    router.get('/admin/history',sessions.requireRoles('admin'),async(req,res)=>{
        try{res.set('Cache-Control','no-store').json({success:true,...await require('./adminHistory')(query,req.query)});}
        catch(error){res.status(error.status || 503).json({success:false,message:error.status?error.message:'Permit history is unavailable. Please retry.'});}
    });
    router.get('/admin/overview',sessions.requireRoles('admin','superadmin'),async(req,res)=>{
        try {
            if(req.user.role==='superadmin') {
                const [accounts]=await query('SELECT COUNT(*) total,SUM(is_verified=0 AND is_active=0) pending FROM users');
                return res.set('Cache-Control','no-store').json({totals:{accounts:Number(accounts.total),pendingAccounts:Number(accounts.pending || 0)},recent:[]});
            }
            const [totals]=await query(`SELECT
                (SELECT COUNT(*) FROM permits) building,
                (SELECT COUNT(*) FROM occupancy_permits) occupancy,
                ((SELECT COUNT(*) FROM permit_change_requests WHERE status='pending' AND change_type NOT IN ('matrix_update','station_dates')) + (SELECT COUNT(*) FROM project_records WHERE kind='permits' AND category='bulk_delete' AND outcome='pending')) buildingPending,
                ((SELECT COUNT(*) FROM occupancy_change_requests WHERE status='pending' AND change_type NOT IN ('matrix_update','station_dates')) + (SELECT COUNT(*) FROM project_records WHERE kind='occupancy' AND category='bulk_delete' AND outcome='pending')) occupancyPending,
                ((SELECT COUNT(*) FROM permit_change_requests WHERE status='pending' AND change_type LIKE '%delete%') + (SELECT COUNT(*) FROM project_records WHERE kind='permits' AND category='bulk_delete' AND outcome='pending')) buildingDeletions,
                ((SELECT COUNT(*) FROM occupancy_change_requests WHERE status='pending' AND change_type LIKE '%delete%') + (SELECT COUNT(*) FROM project_records WHERE kind='occupancy' AND category='bulk_delete' AND outcome='pending')) occupancyDeletions`);
            const {records:recent}=await require('./adminHistory')(query,{},6,false);
            res.set('Cache-Control','no-store').json({totals,recent});
        }catch(error){res.status(503).json({message:'Dashboard information is unavailable. Please retry.'});}
    });
    return router;
};
