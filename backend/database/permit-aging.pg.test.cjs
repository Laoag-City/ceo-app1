// Read-only projection under the application's restricted role in a disposable schema.
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),pg=require('pg');
const aging=require('../monitorBP backend/permitAging');
test('real PostgreSQL aging ignores unsuccessful activity, comments and other registries without changing data',async()=>{
    const config=JSON.parse(process.env.OFFICE_PG_CONNECTIONS||'[]').find(c=>c.source==='permit_system');
    assert.equal(config?.database,'permit_system_test');assert.equal(config.host,'localhost');
    const schema='aging_verify_'+crypto.randomBytes(8).toString('hex'),owner=new pg.Client(config);let pool;
    await owner.connect();
    try {
        await owner.query('CREATE SCHEMA '+schema);await owner.query('SET search_path TO '+schema);
        await owner.query('CREATE TABLE project_records (project_id INT,kind TEXT,category TEXT,outcome TEXT,created_at TIMESTAMP)');
        await owner.query(`INSERT INTO project_records VALUES
            (1,'permits','activity','saved','2026-10-31 23:59:59'),
            (2,'permits','activity','saved','2026-10-21 00:00:01'),
            (3,'permits','activity','saved','2026-10-05 09:00:00'),
            (3,'permits','comment','saved','2026-11-04 10:00:00'),
            (3,'permits','activity','failed','2026-11-04 10:00:00'),
            (3,'permits','activity','blocked','2026-11-04 10:00:00'),
            (3,'permits','activity','unconfirmed','2026-11-04 10:00:00'),
            (3,'occupancy','activity','saved','2026-11-03 10:00:00'),
            (NULL,'permits','activity','saved','2026-11-04 10:00:00')`);
        await owner.query('GRANT USAGE ON SCHEMA '+schema+' TO permit_app_migration');await owner.query('GRANT SELECT ON project_records TO permit_app_migration');
        const RealPool=pg.Pool;pg.Pool=class extends RealPool{constructor(options){super({...options,options:options.options+' -c search_path='+schema+' -c role=permit_app_migration'});}};
        try{pool=require('./index').createPool({database:'permit_system',dateStrings:['DATE']});}finally{pg.Pool=RealPool;}
        const records=[1,2,3,4,5].map(id=>({id,permit_date:'2026-09-01',...(id===5?{final_approval:{status:'approved'}}:{})}));
        const before=(await owner.query('SELECT * FROM project_records')).rows;
        const result=await aging.decorate(pool,'permits',records,{today:'2026-11-04'});
        assert.deepEqual(result.map(p=>p.aging.status),['normal','followup','overdue','overdue','completed']);
        assert.deepEqual(result.map(p=>p.aging.inactive_days),[4,14,30,64,null]);
        assert.equal(result[3].aging.basis,'filing');assert.equal(result[2].aging.last_activity_date,'2026-10-05');
        const occupancy=await aging.decorate(pool,'occupancy',[{id:3,date_applied:'2026-09-01'}],{today:'2026-11-04'});
        assert.equal(occupancy[0].aging.inactive_days,1);
        assert.deepEqual((await owner.query('SELECT * FROM project_records')).rows,before);assert.ok(records.every(r=>!r.aging));
    }finally{if(pool)await pool.end();await owner.query('SET search_path TO public');await owner.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await owner.end();}
});
