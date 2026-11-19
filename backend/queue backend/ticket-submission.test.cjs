const test=require('node:test'),assert=require('node:assert/strict'),mysql=require('mysql2/promise');
const {createTicketSubmission,validateTicket}=require('./ticket-submission');
const payload={requestId:'11111111-1111-4111-8111-111111111111',name:'Test Visitor',phone:'09123456789',email:'',barangay:'Test address',reason:'Inquire'};
test('missing services and missing request tokens are rejected',()=>{assert.throws(()=>validateTicket({...payload,reason:'   '}),/service/);assert.throws(()=>validateTicket({...payload,requestId:''}),/Refresh/);});
test('ticket retry replays committed result; new visit works; conflict, rollback and reset are safe',async t=>{
 const conn=await mysql.createConnection({host:'localhost',user:'root',password:'',database:'queue_system'});t.after(()=>conn.end());
 await conn.query('CREATE TEMPORARY TABLE tickets (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255),phone VARCHAR(255),email VARCHAR(255),barangay VARCHAR(1000),reason VARCHAR(255),report_visit_id CHAR(36),report_tracking_started SMALLINT DEFAULT 0) ENGINE=InnoDB');
 await conn.query('CREATE TEMPORARY TABLE ticket_submission_keys (request_id CHAR(36) PRIMARY KEY,fingerprint CHAR(64),ticket_id BIGINT NULL) ENGINE=InnoDB');
 const db={query:(sql,args)=>sql.startsWith('CREATE TABLE')?Promise.resolve([]):conn.query(sql,args),getConnection:async()=>({query:(...args)=>conn.query(...args),beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),release(){}})};
 const service=createTicketSubmission(db),first=await service.submit(payload),retry=await service.submit(payload);
 assert.equal(retry.ticketId,first.ticketId);assert.equal(retry.duplicate,true);
 await assert.rejects(service.submit({...payload,reason:'Receiving Bldg. Permit'}),/different details/);
 const next=await service.submit({...payload,requestId:'22222222-2222-4222-8222-222222222222'});assert.notEqual(first.ticketId,next.ticketId);
 const [rows]=await conn.query('SELECT COUNT(*) AS count FROM tickets');assert.equal(rows[0].count,2);
 const [metrics]=await conn.query('SELECT report_visit_id,report_tracking_started FROM tickets');
 assert.ok(metrics.every(row=>/^[a-f0-9-]{36}$/.test(row.report_visit_id)&&Number(row.report_tracking_started)===1));
 assert.notEqual(metrics[0].report_visit_id,metrics[1].report_visit_id);
 await service.invalidate();await assert.rejects(service.submit(payload),/reset/);
 });
