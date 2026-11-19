/**
 * MAINTAINER GUIDE
 * Retry-safe queue ticket creation.
 * The client requestId identifies one logical submission. A payload fingerprint detects reuse with different data; the stored ticket ID allows a retry to return the original result.
 * Keep key handling and ticket insertion in one transaction to prevent duplicate tickets.
 */
const crypto = require('crypto');
const {isService} = require('./queue-services');
const bad = message => Object.assign(new Error(message), {status:400});
function validateTicket(body = {}) {
 if(!body || typeof body!=='object' || Array.isArray(body))throw bad('Choose a requested service.');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 const data={name:null,phone:null,email:null,barangay:null,reason};
 if(!isService(data.reason))throw bad('Choose one of the available services.');
 if(!/^[a-f0-9-]{36}$/i.test(body.requestId||''))throw Object.assign(new Error('Refresh the kiosk page before issuing a ticket.'),{status:400});
 return data;
}
function createTicketSubmission(db) {
 let ready;
 function ensure(){return ready ||= db.query('CREATE TABLE IF NOT EXISTS ticket_submission_keys (request_id CHAR(36) PRIMARY KEY, fingerprint CHAR(64) NOT NULL, ticket_id BIGINT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB').catch(e=>{ready=null;throw e;});}
 async function submit(body){
  const data=validateTicket(body),hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  await ensure();const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   if(conn.dialect==='postgres')await conn.query("SELECT pg_advisory_xact_lock(hashtextextended('queue_system:service-transitions',0))");
   const [reservation]=await conn.query('INSERT IGNORE INTO ticket_submission_keys (request_id,fingerprint) VALUES (?,?)',[body.requestId,hash]);
   if(!reservation.affectedRows){
    const [rows]=await conn.query('SELECT fingerprint,ticket_id FROM ticket_submission_keys WHERE request_id=? FOR UPDATE',[body.requestId]);
    if(rows[0].fingerprint!==hash)throw Object.assign(new Error('This submission was already used with different details. Refresh before starting a new ticket.'),{status:409});
    if(!rows[0].ticket_id)throw Object.assign(new Error('This submission belongs to a queue that was reset. Refresh before starting a new ticket.'),{status:409});
    await conn.commit();return {success:true,ticketId:'TKT-'+rows[0].ticket_id,duplicate:true};
   }
   const [ticket]=await conn.query('INSERT INTO tickets (name,phone,email,barangay,reason,report_visit_id,report_tracking_started) VALUES (?,?,?,?,?,?,?)',[...Object.values(data),crypto.randomUUID(),1]);
   await conn.query('UPDATE ticket_submission_keys SET ticket_id=? WHERE request_id=?',[ticket.insertId,body.requestId]);
   await conn.commit();return {success:true,ticketId:'TKT-'+ticket.insertId};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 }
 async function invalidate(){await ensure();await db.query('UPDATE ticket_submission_keys SET ticket_id=NULL');}
 return {submit,invalidate,initialize:ensure};
}
module.exports={createTicketSubmission,validateTicket};
