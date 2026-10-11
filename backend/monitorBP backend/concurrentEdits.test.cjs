// Two real database connections are needed to test locking. Everything here lives
// in a uniquely named disposable database; production tables are never fixtures.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
const createEdits=require('./editWorkflow');
const createInspections=require('./inspectionWorkflow');

test('concurrent workspace saves use the loaded version and remain atomic',async t=>{
    const database='permit_concurrency_test_'+crypto.randomBytes(10).toString('hex');
    assert.match(database,/^permit_concurrency_test_[a-f0-9]{20}$/);
    const admin=await mysql.createConnection({host:'localhost',user:'root'});
    let created=false;
    try {
        await admin.query('CREATE DATABASE `'+database+'`');created=true;
        await admin.query('USE `'+database+'`');
        const schemas={
            users:'id INT PRIMARY KEY,username VARCHAR(50),role VARCHAR(20),is_active INT,is_verified INT',
            permit_user_profiles:'user_id INT PRIMARY KEY,display_name VARCHAR(80)',
            permit_station_assignments:'user_id INT,station_key VARCHAR(120),station_name VARCHAR(100),PRIMARY KEY (user_id,station_key)',
            permit_final_reviews:'id INT AUTO_INCREMENT PRIMARY KEY,kind VARCHAR(16),project_id INT,decision VARCHAR(16),reviewer_id INT,reviewer_name VARCHAR(100),remarks TEXT,snapshot_hash CHAR(64),snapshot JSON,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            permits:'id INT PRIMARY KEY,project_title VARCHAR(100),location VARCHAR(100),owner_name VARCHAR(100),designer_name VARCHAR(100),permit_date DATE,rejection_history JSON',
            occupancy_permits:'id INT PRIMARY KEY,project_title VARCHAR(100),date_applied DATE,rejection_history JSON',
            permit_lots:'id INT AUTO_INCREMENT PRIMARY KEY,permit_id INT,lot_number VARCHAR(100)',
            sub_permits:'id INT PRIMARY KEY,permit_id INT,sub_project_title VARCHAR(100)',
            permit_routing_matrix:'id INT AUTO_INCREMENT PRIMARY KEY,permit_id INT,sub_permit_id INT,discipline_name VARCHAR(100),engineer_name VARCHAR(100),signature_status VARCHAR(30),feedback_remarks TEXT,date_checked DATE,date_approved DATE,last_updated_by INT NULL',
            occupancy_routing_matrix:'id INT AUTO_INCREMENT PRIMARY KEY,occupancy_id INT,discipline_name VARCHAR(100),engineer_name VARCHAR(100),signature_status VARCHAR(30),feedback_remarks TEXT,date_checked DATE,date_approved DATE,last_updated_by INT NULL',
            occupancy_inspections:'id INT AUTO_INCREMENT PRIMARY KEY,occupancy_id INT,inspection_type VARCHAR(50),inspection_date DATE,inspector_name VARCHAR(150),result VARCHAR(50),findings TEXT,next_inspection_date DATE',
            occupancy_checklists:'occupancy_id INT PRIMARY KEY,checklist_state JSON'
        };
        for(const [table,columns] of Object.entries(schemas))await admin.query('CREATE TABLE '+table+' ('+columns+') ENGINE=InnoDB');
        for(const [table,key] of [['permit_change_requests','permit_id'],['occupancy_change_requests','occupancy_id']])await admin.query('CREATE TABLE '+table+' (id INT AUTO_INCREMENT PRIMARY KEY,'+key+' INT,requested_by INT,change_type VARCHAR(50),changes JSON,status VARCHAR(20),remarks TEXT,reviewed_by VARCHAR(50),reviewed_at TIMESTAMP NULL) ENGINE=InnoDB');
        await admin.query("INSERT INTO users VALUES (1,'operator','operator',1,1),(2,'boss','admin',1,1),(3,'it','superadmin',1,1)");
        await admin.query("INSERT INTO permit_user_profiles VALUES (1,'Reviewer')");
        await admin.query("INSERT INTO permit_station_assignments VALUES (1,'ELECTRICAL','Electrical')");
        await admin.query("INSERT INTO permits (id,project_title,permit_date,rejection_history) VALUES (10,'Original','2026-01-01','[]')");
        await admin.query("INSERT INTO occupancy_permits VALUES (10,'Original','2026-01-01','[]')");
        await admin.query("INSERT INTO sub_permits VALUES (7,10,'Annex')");
        for(const [table,key] of [['permit_routing_matrix','permit_id'],['occupancy_routing_matrix','occupancy_id']])await admin.query('INSERT INTO '+table+' (id,'+key+',discipline_name,engineer_name,signature_status,feedback_remarks) VALUES (50,10,?,?,?,?)',['Electrical','Original','Pending','']);
        await admin.query("INSERT INTO permit_routing_matrix (id,sub_permit_id,discipline_name,engineer_name,signature_status,feedback_remarks) VALUES (51,7,'Electrical','Sub engineer','Approved','')");
        const open=()=>mysql.createConnection({host:'localhost',user:'root',database});
        const edits=createEdits(open),inspections=createInspections(open);
        const call=async(handler,{id=10,inspId,role='operator',userId,version='',body={},query={}}={})=>{
            const req={user:{id:userId || (role==='operator'?1:role==='admin'?2:3),role},params:{id,inspId},body,query,get:name=>name==='x-record-version'?version:undefined};
            const res={code:200,locals:{},status(code){this.code=code;return this},json(body){this.body=body;return this}};
            await handler(req,res,()=>{res.next=true});return res;
        };
        const read=async kind=>(await call(edits.read(kind))).body;
        await t.test('two direct detail saves: one wins, one conflicts; dates retain calendar values',async()=>{
            const loaded=await read('permits');assert.equal(loaded.permit_date,'2026-01-01');
            const results=await Promise.all(['First','Second'].map(title=>call(edits.submit('permits','permit_update',{project_title:title,lot_numbers:[title+' lot']}),{role:'admin',version:loaded._version})));
            assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
            const winner=results[0].code===200?'First':'Second',saved=await read('permits');
            assert.equal(saved.project_title,winner);assert.deepEqual(saved.lot_numbers,[winner+' lot']);
            const stale=await call(edits.submit('permits','permit_update',{project_title:'Stale operator'}),{version:loaded._version});assert.equal(stale.code,409);
            assert.equal((await admin.query('SELECT * FROM permit_change_requests'))[0].length,0);
            const fail=await call(edits.submit('permits','permit_update',{project_title:'Must roll back',lot_numbers:'invalid'}),{role:'admin',version:saved._version});assert.equal(fail.code,400);
            assert.equal((await read('permits')).project_title,winner);
        });
        for(const kind of ['permits','occupancy'])await t.test(kind+': competing station saves and final reviewers reject stale versions',async()=>{
            const loaded=await read(kind),key=kind==='permits'?'permit_id':'occupancy_id';
            const payload=remarks=>({updatedMatrixRows:[{id:50,engineer_name:'Reviewer',signature_status:'Approved',feedback_remarks:remarks}],newHistoricalEntries:[]});
            const saves=await Promise.all(['First reviewer','Second reviewer'].map(name=>call(edits.submit(kind,'matrix_update',payload(name)),{version:loaded._version})));
            assert.deepEqual(saves.map(r=>r.code).sort(),[200,409]);
            const table=kind==='permits'?'permit_change_requests':'occupancy_change_requests';
            assert.equal((await admin.query('SELECT COUNT(*) n FROM '+table))[0][0].n,0);
            const reviewVersion=(await read(kind))._version;
            const reviews=await Promise.all(['approved','returned'].map(decision=>call(edits.finalReview(kind),{role:'admin',version:reviewVersion,body:{decision,remarks:'Boss review'}})));
            assert.deepEqual(reviews.map(r=>r.code).sort(),[200,409]);
            assert.equal((await call(edits.submit(kind,'matrix_update',payload('Stale operator')),{version:loaded._version})).code,409);
            const fresh=await read(kind);
            const direct=await Promise.all(['Direct A','Direct B'].map(name=>call(edits.submit(kind,'matrix_update',payload(name)),{version:fresh._version})));
            assert.deepEqual(direct.map(r=>r.code).sort(),[200,409]);
            const beforeAdd=await read(kind);
            const adds=await Promise.all([1,2].map(()=>call(edits.routing(kind),{version:beforeAdd._version,body:{[key]:10,discipline_name:'Mechanical'}})));
            assert.deepEqual(adds.map(r=>r.code).sort(),[200,409]);
            assert.equal((await call(edits.routing(kind,true),{role:'admin',version:beforeAdd._version,query:{[key]:10,discipline_name:'Electrical'}})).code,409);
            assert.ok((await read(kind)).matrix.some(row=>row.discipline_name==='Electrical'));
            const freshAdd=await read(kind);
            assert.equal((await call(edits.routing(kind,true),{role:'admin',version:freshAdd._version,query:{[key]:10,discipline_name:'Mechanical'}})).code,200);
            assert.equal((await call(edits.submit(kind,'matrix_update',payload('No version')))).code,409);
            if(kind==='permits') {
                const current=await read(kind);
                assert.equal((await call(edits.routing(kind),{version:current._version,body:{sub_permit_id:7,discipline_name:'Sanitary'}})).code,200);
                assert.equal((await read(kind)).sub_permits[0].matrix.length,2);
            }
        });
        await t.test('two inspection edits cannot overwrite each other or authorize stale deletion',async()=>{
            const body={inspection_type:'Preliminary',inspection_date:'2026-01-01',inspector_name:'Inspector',result:'Scheduled',findings:'Original',next_inspection_date:null};
            assert.equal((await call(inspections.save(),{body})).code,200);
            const loaded=(await call(inspections.readInspections)).body.inspections[0];assert.equal(loaded.inspection_date,'2026-01-01');
            const replies=await Promise.all(['First finding','Second finding'].map(findings=>call(inspections.save(true),{inspId:loaded.id,version:loaded._version,body:{...body,findings}})));
            assert.deepEqual(replies.map(r=>r.code).sort(),[200,409]);
            assert.equal((await call(inspections.submit,{inspId:loaded.id,version:loaded._version})).code,409);
            const fresh=(await call(inspections.readInspections)).body.inspections[0];
            assert.equal((await call(inspections.submit,{inspId:fresh.id,version:fresh._version})).body.pending,true);
            assert.equal((await call(inspections.save(true),{inspId:fresh.id,version:fresh._version,body:{...body,findings:'Changed after deletion request'}})).code,200);
            const id=(await admin.query("SELECT id FROM occupancy_change_requests WHERE change_type='inspection_delete'"))[0][0].id;
            assert.equal((await call(inspections.review('approve'),{id,role:'admin'})).code,409);
            assert.equal((await call(inspections.readInspections)).body.inspections.length,1);
        });
        await t.test('two operators sharing Electrical cannot overwrite each other and no-op saves keep the winner attribution',async()=>{
            await admin.query("INSERT INTO users VALUES (4,'second','operator',1,1)");await admin.query("INSERT INTO permit_user_profiles VALUES (4,'Second Reviewer')");await admin.query("INSERT INTO permit_station_assignments VALUES (4,'ELECTRICAL','Electrical')");
            const loaded=await read('permits');
            const payload=userId=>({updatedMatrixRows:[{id:50,signature_status:'Approved',feedback_remarks:'Shared operator '+userId}]});
            const results=await Promise.all([1,4].map(userId=>call(edits.submit('permits','matrix_update',payload(userId)),{userId,version:loaded._version})));
            assert.deepEqual(results.map(result=>result.code).sort(),[200,409]);
            const winner=results[0].code===200?1:4,loser=winner===1?4:1,saved=await read('permits');
            assert.equal(saved.matrix[0].last_updated_by,winner);assert.equal(saved.matrix[0].engineer_name,winner===1?'Reviewer':'Second Reviewer');
            const unchanged=await call(edits.submit('permits','matrix_update',payload(winner)),{userId:loser,version:saved._version});
            assert.equal(unchanged.body.unchanged,true);assert.equal((await read('permits'))._version,saved._version);assert.equal((await read('permits')).matrix[0].last_updated_by,winner);
        });
        await t.test('first checklist insert and later updates reject stale versions and preserve saved values',async()=>{
            const baseline=(await call(inspections.readChecklist)).body;
            const replies=await Promise.all([{documentA:true},{documentB:true}].map(checklist_state=>call(inspections.saveChecklist,{version:baseline._version,body:{checklist_state}})));
            assert.deepEqual(replies.map(r=>r.code).sort(),[200,409]);
            const saved=(await call(inspections.readChecklist)).body;
            assert.deepEqual(saved.checklist_state,replies[0].code===200?{documentA:true}:{documentB:true});
            assert.equal((await call(inspections.saveChecklist,{body:{checklist_state:{}}})).code,409);
            assert.equal((await call(inspections.saveChecklist,{version:saved._version,body:{checklist_state:{documentA:true,documentB:true}}})).code,200);
            assert.equal((await call(inspections.saveChecklist,{version:saved._version,body:{checklist_state:{}}})).code,409);
        });
    } finally {
        // Drop only the exact fixture database this invocation successfully created.
        if(created && /^permit_concurrency_test_[a-f0-9]{20}$/.test(database))await admin.query('DROP DATABASE `'+database+'`');
        await admin.end();
    }
});
