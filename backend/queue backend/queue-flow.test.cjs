const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createQueueService}=require('./queue-service');
const {ensureReportColumns}=require('./queue-reports');
const tasks={PC1:['Receiving Bldg. Permit','Receiving Bldg. Occupancy','Inquire'],PC2:['Releasing Bldg. Occupancy'],PC3:['Releasing Bldg. Permit']};

async function fixture() {
    let conn,end;
    if(process.env.DB_ENGINE==='postgres') {
        const settings=JSON.parse(process.env.OFFICE_PG_CONNECTIONS||'[]');
        assert.equal(settings[0]?.database,'queue_system_test','Use Verify-QueueWindows.ps1 for isolated PostgreSQL fixtures');
        const pool=require('../database').createPool({database:'queue_system'});
        conn=await pool.getConnection();end=async()=>{conn.release();await pool.end();};
        await conn.query("CREATE TEMP TABLE tickets (id INTEGER PRIMARY KEY,name VARCHAR(100),reason TEXT,status VARCHAR(20) DEFAULT 'waiting',called_by VARCHAR(50),recall_stamp BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,report_visit_id CHAR(36),report_tracking_started SMALLINT DEFAULT 0,first_called_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,dropped_at TIMESTAMPTZ,service_started_at TIMESTAMPTZ,service_ms BIGINT DEFAULT 0)");
        await conn.query('GRANT SELECT,INSERT,UPDATE,DELETE ON tickets TO queue_app_migration');
        await conn.query('SET ROLE queue_app_migration');
    }else {
        conn=await require('mysql2/promise').createConnection({host:'localhost',user:'root',database:'queue_system'});
        end=()=>conn.end();
        await conn.query("CREATE TEMPORARY TABLE tickets (id INT PRIMARY KEY,name VARCHAR(100),reason TEXT,status ENUM('waiting','holding','serving','dropped','completed') DEFAULT 'waiting',called_by VARCHAR(50),recall_stamp BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
        await ensureReportColumns(conn, 'tickets');
    }
    const act=createQueueService({getConnection:async()=>({dialect:conn.dialect,query:conn.query.bind(conn),beginTransaction:conn.beginTransaction.bind(conn),commit:conn.commit.bind(conn),rollback:conn.rollback.bind(conn),release(){}})},'queue-window-test:'+process.pid);
    const seed=async(rows)=>{
        await conn.query('DELETE FROM tickets');
        for(const [id,workspace,status='waiting'] of rows)await conn.query('INSERT INTO tickets (id,name,reason,status,called_by) VALUES (?,?,?,?,?)',[id,'Client '+id,tasks[workspace][0],status,['serving','completed'].includes(status)?workspace:null]);
    };
    return {conn,act,seed,end};
}

test('all receiving and inquiry services route to Window 1 while releasing stays isolated at Windows 2 and 3',async()=>{
    const {conn,act,seed,end}=await fixture();
    try {
        await seed([[1,'PC1'],[2,'PC1'],[3,'PC1'],[4,'PC2'],[5,'PC3']]);
        await conn.query('UPDATE tickets SET reason=? WHERE id=2',['Receiving Bldg. Occupancy']);
        await conn.query('UPDATE tickets SET reason=? WHERE id=3',['Inquire']);
        await assert.rejects(act('drop',{workspace:'PC3',ticketId:'TKT-1',expectedStatus:'waiting'}),/another window/);
        await assert.rejects(act('drop',{workspace:'PC1',ticketId:'TKT-5',expectedStatus:'waiting'}),/another window/);
        for(const [workspace,ids] of [['PC1',[1,2,3]],['PC2',[4]],['PC3',[5]]]) {
            for(const id of ids) {
                const called=await act('call-next',{workspace,source:'queue'});
                assert.equal(called.id,id);
                assert.equal(called.called_by,workspace);
                await act('complete',{workspace,ticketId:`TKT-${id}`});
            }
            await assert.rejects(act('call-next',{workspace,source:'queue'}),/No waiting tickets/);
        }
    }finally{await end();}
});

test('reassigned windows can finish their existing active ticket without rewriting history or taking another window’s ticket',async()=>{
    const {conn,act,seed,end}=await fixture();
    try {
        for(const action of ['complete','drop','next','hold']) {
            await seed([[10,'PC3','serving'],[11,'PC1'],[12,'PC3']]);
            await conn.query("UPDATE tickets SET called_by='PC1' WHERE id=10");
            await assert.rejects(act('drop',{workspace:'PC3',ticketId:'TKT-10',expectedStatus:'serving'}),/another window/);
            const result=await act(action,{workspace:'PC1',ticketId:'TKT-10',expectedStatus:'serving'});
            const [[saved]]=await conn.query('SELECT reason,status,called_by FROM tickets WHERE id=10');
            assert.equal(saved.reason,'Releasing Bldg. Permit');
            if(action==='hold') {
                assert.equal(saved.status,'holding');
                assert.equal(saved.called_by,null);
                await assert.rejects(act('resume',{workspace:'PC1',ticketId:'TKT-10',currentTicketId:null}),/another window/);
                assert.equal((await act('resume',{workspace:'PC3',ticketId:'TKT-10',currentTicketId:null})).ticket.called_by,'PC3');
            } else {
                assert.equal(saved.status,action==='drop'?'dropped':'completed');
                assert.equal(saved.called_by,'PC1');
                if(action==='next') {
                    assert.equal(result.ticket.id,11);
                    assert.equal(result.ticket.reason,'Receiving Bldg. Permit');
                }
            }
        }
    }finally{await end();}
});

test('actual clerk handlers and SQL: finish and call next, select held, drop, and reconnect across all three windows',async()=>{
    const {conn,act,seed,end}=await fixture();
    try {
        await seed([[1,'PC1'],[2,'PC1'],[3,'PC2'],[4,'PC3'],[5,'PC1','holding'],[6,'PC1','holding']]);
        const source=readFileSync(path.join(__dirname,'../../frontend/portal-react/system/features/queue/service-desk.html'),'utf8');
        const windows=[],map=row=>row&&({id:`TKT-${row.id}`,name:row.name,reason:row.reason,calledBy:row.called_by,recallStamp:Number(row.recall_stamp)});
        const serverSource=readFileSync(path.join(__dirname,'queueServer.js'),'utf8');
        const serverContext=vm.createContext({db:conn});
        vm.runInContext(serverSource.slice(serverSource.indexOf('function mapTicket('),serverSource.indexOf('const queueUpdates =')),serverContext);
        async function broadcast() {
            const data=await vm.runInContext('getQueueState()',serverContext);
            for(const w of windows)w.handlers.queueUpdate(data);
        }
        for(const workspace of Object.keys(tasks)) {
            const handlers={},nodes={};
            for(const id of ['activeTicketLabel','activeTicketName','activeTicketReason','activeTicketStatus','queueActionFeedback','callNextBtn','holdBtn','dropBtn','activeDetailsBtn','recallBtn'])nodes[id]={dataset:{},classList:{toggle(){}},addEventListener(event,fn){this.click=fn;}};
            const context=vm.createContext({document:{getElementById:id=>nodes[id],querySelectorAll:()=>[],querySelector:()=>({classList:{toggle(){}},lastChild:{}})},socket:{on:(event,fn)=>handlers[event]=fn},currentWorkspace:workspace,workspaceTasks:tasks,renderLists(){},BACKEND_URL:'test',RequestFeedback:{fetch:async(url,options)=>{
                try {
                    const action=url.split('/').pop(),result=await act(action,JSON.parse(options.body));
                    await broadcast();
                    return {json:async()=>({success:true,ticket:map(['next','resume'].includes(action)?result.ticket:result),completedTicket:map(result.completedTicket)})};
                }catch(error){return {json:async()=>({success:false,message:error.message})};}
            }}});
            vm.runInContext(source.slice(source.indexOf('    let localTicketRegistry ='),source.indexOf('    const searchInput =')),context);
            const actionStart=source.indexOf('    async function serviceAction');
            vm.runInContext(source.slice(actionStart,source.indexOf("    document.getElementById('resetBtn')",actionStart)),context);
            windows.push({nodes,handlers,context});
        }
        await broadcast();
        for(const w of windows) {
            assert.equal(w.nodes.callNextBtn.disabled,false);
            await w.nodes.callNextBtn.click();
            assert.equal(w.nodes.holdBtn.disabled,false);
            assert.equal(w.nodes.callNextBtn.disabled,false,'Next stays available to finish current');
        }
        const [one,two,three]=windows;
        assert.equal(two.nodes.activeTicketLabel.textContent,'TKT-3');
        assert.equal(three.nodes.activeTicketLabel.textContent,'TKT-4');
        await one.nodes.holdBtn.click();
        assert.equal(one.nodes.holdBtn.disabled,true);
        await one.nodes.callNextBtn.click();
        assert.equal(one.nodes.activeTicketLabel.textContent,'TKT-2');
        await vm.runInContext("serviceAction('resume',undefined,{ticketId:'TKT-6',currentTicketId:'TKT-2'})",one.context);
        assert.equal(one.nodes.activeTicketLabel.textContent,'TKT-6','Chosen held ticket, rather than first, is called');
        assert.match(one.nodes.queueActionFeedback.textContent,/TKT-2 moved to Finished/);
        assert.equal((await conn.query('SELECT status FROM tickets WHERE id=2'))[0][0].status,'completed');
        await one.nodes.recallBtn.click();assert.match(one.nodes.queueActionFeedback.textContent,/Calling TKT-6 again/);
        await vm.runInContext("serviceAction('drop',undefined,{ticketId:'TKT-5',expectedStatus:'holding'})",one.context);
        assert.equal(one.nodes.activeTicketLabel.textContent,'TKT-6');
        await one.nodes.callNextBtn.click();
        assert.equal(one.nodes.activeTicketLabel.textContent,'Ready for a client');
        assert.equal(one.nodes.callNextBtn.disabled,true,'Next does not automatically resume held clients');
        await vm.runInContext("serviceAction('resume',undefined,{ticketId:'TKT-1',currentTicketId:null})",one.context);
        assert.equal(one.nodes.activeTicketLabel.textContent,'TKT-1');
        one.handlers.disconnect();assert.equal(one.nodes.holdBtn.disabled,true);
        await broadcast();assert.equal(one.nodes.holdBtn.disabled,false);
        assert.equal(two.nodes.activeTicketLabel.textContent,'TKT-3');
        assert.equal(three.nodes.activeTicketLabel.textContent,'TKT-4');
    }finally{await end();}
});

test('SQL transactions reject stale selections, wrong windows, duplicate Next, and changed Drop targets without losing clients',async()=>{
    const {conn,act,seed,end}=await fixture();
    const state=async()=>JSON.stringify((await conn.query('SELECT * FROM tickets ORDER BY id'))[0]);
    const rejectWithoutChanges=async(action,input,pattern)=>{
        const before=await state();await assert.rejects(act(action,input),pattern);assert.equal(await state(),before);
    };
    try {
        await seed([[1,'PC1','serving'],[2,'PC1'],[3,'PC2','holding'],[4,'PC1','holding']]);
        await rejectWithoutChanges('next',{workspace:'PC1',ticketId:null},/current ticket changed/);
        await rejectWithoutChanges('next',{workspace:'PC1',ticketId:'TKT-9'},/current ticket changed/);
        await rejectWithoutChanges('resume',{workspace:'PC1',ticketId:'TKT-3',currentTicketId:'TKT-1'},/held ticket changed/);
        await rejectWithoutChanges('resume',{workspace:'PC1',ticketId:'TKT-2',currentTicketId:'TKT-1'},/held ticket changed/);
        await rejectWithoutChanges('resume',{workspace:'PC1',ticketId:'TKT-4',currentTicketId:null},/current ticket changed/);
        await rejectWithoutChanges('resume',{workspace:'PC1',currentTicketId:'TKT-1'},/Choose a held/);
        await rejectWithoutChanges('drop',{workspace:'PC1',ticketId:'TKT-3',expectedStatus:'holding'},/ticket changed/);
        await rejectWithoutChanges('drop',{workspace:'PC1',ticketId:'TKT-4',expectedStatus:'serving'},/ticket changed/);
        const result=await act('next',{workspace:'PC1',ticketId:'TKT-1'});
        assert.equal(result.completedTicket.id,1);assert.equal(result.ticket.id,2);
        await rejectWithoutChanges('next',{workspace:'PC1',ticketId:'TKT-1'},/current ticket changed/);
        await rejectWithoutChanges('drop',{workspace:'PC1',ticketId:'TKT-1'},/ticket changed/);
        await act('hold',{workspace:'PC1',ticketId:'TKT-2'});
        await rejectWithoutChanges('drop',{workspace:'PC1',ticketId:'TKT-2',expectedStatus:'serving'},/ticket changed/);
        await rejectWithoutChanges('next',{workspace:'PC1',ticketId:null},/No waiting/);
        await act('resume',{workspace:'PC1',ticketId:'TKT-4',currentTicketId:null});
        await act('drop',{workspace:'PC1',ticketId:'TKT-4',expectedStatus:'serving'});
        await rejectWithoutChanges('resume',{workspace:'PC1',ticketId:'TKT-4',currentTicketId:null},/held ticket changed/);
        await seed([[1,'PC1','serving'],[2,'PC1']]);
        // Force the second write to fail: completing current must roll back too.
        if(conn.dialect==='postgres')await conn.query('RESET ROLE');
        await conn.query("ALTER TABLE tickets ADD CONSTRAINT fail_handoff CHECK (id <> 2 OR status <> 'serving')");
        if(conn.dialect==='postgres')await conn.query('SET ROLE queue_app_migration');
        await assert.rejects(act('next',{workspace:'PC1',ticketId:'TKT-1'}));
        assert.equal((await conn.query('SELECT status FROM tickets WHERE id=1'))[0][0].status,'serving');
        assert.equal((await conn.query('SELECT status FROM tickets WHERE id=2'))[0][0].status,'waiting');
    }finally{await end();}
});

test('holding Window 2 preserves Window 1 waiting tickets and other windows in the broadcast snapshot',async()=>{
    const {conn,act,seed,end}=await fixture();
    try {
        await seed([[1001,'PC1'],[1002,'PC2','serving'],[1003,'PC3','serving']]);
        const serverSource=readFileSync(path.join(__dirname,'queueServer.js'),'utf8');
        const context=vm.createContext({db:conn});
        vm.runInContext(serverSource.slice(serverSource.indexOf('function mapTicket('),serverSource.indexOf('const queueUpdates =')),context);
        const snapshot=()=>vm.runInContext('getQueueState()',context);
        const before=await snapshot();
        assert.equal(before.queue[0].id,'TKT-1001');
        const held=await act('hold',{workspace:'PC2',ticketId:'TKT-1002'});
        assert.equal(held.status,'holding');
        const after=await snapshot();
        assert.equal(JSON.stringify(after.queue),JSON.stringify(before.queue),'Hold cannot change another window’s waiting tickets');
        assert.equal(after.onHold[0].id,'TKT-1002');
        assert.equal(after.serving.length,1);
        assert.equal(after.serving[0].id,'TKT-1003');
        assert.equal(after.serving[0].calledBy,'PC3');
        const called=await act('next',{workspace:'PC1',ticketId:null});
        assert.equal(called.ticket.id,1001,'The retained Window 1 ticket remains callable');
        assert.equal(called.ticket.status,'serving');
    }finally{await end();}
});
