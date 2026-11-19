const settings=JSON.parse(process.env.OFFICE_PG_CONNECTIONS || '[]');
if(process.env.DB_ENGINE!=='postgres' || settings.length!==1 || settings[0].source!=='permit_system' || settings[0].database!=='permit_system_test')throw Error('Use Verify-SignatureUpdates.ps1 to load the isolated test connection.');
const open=async()=>{
    const pool=require('./index').createPool({database:'permit_system'}),conn=await pool.getConnection();
    return {...conn,end:async()=>{conn.release();await pool.end();}};
};
require('./station-workflow.scenarios.cjs')(open,'postgres');
require('./people-directory.scenarios.cjs')(open,'postgres');
require('./admin-history.scenarios.cjs')(open,'postgres');
require('./audit-names.scenarios.cjs')(open);
require('./permit-added-at.scenarios.cjs')(open,'postgres');
