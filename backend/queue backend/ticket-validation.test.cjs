const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateTicket,createTicketSubmission}=require('./ticket-submission');
const {tasks}=require('./queue-services');
const payload={requestId:'11111111-1111-4111-8111-111111111111',reason:'Inquire'};
test('all five workstation services can issue tickets without personal details',()=>{
 for(const reason of Object.values(tasks).flat())assert.deepEqual(validateTicket({...payload,reason}),{name:null,phone:null,email:null,barangay:null,reason});
 for(const reason of ['Unknown','Releasing Bldg. Permit EXTRA','',null,17])assert.throws(()=>validateTicket({...payload,reason}),e=>e.status===400);
});
test('old personal fields are ignored and unsupported request shapes are rejected',()=>{
 const clean=validateTicket(payload);
 assert.deepEqual(validateTicket({...payload,name:'Old client',phone:'bad',email:'invalid',barangay:'Address'}),clean);
 for(const value of [null,[],42])assert.throws(()=>validateTicket(value),e=>e.status===400);
 assert.throws(()=>validateTicket({...payload,requestId:''}),e=>e.status===400);
});
test('invalid services are rejected before database writes',async()=>{
 let touched=false;const service=createTicketSubmission({query(){touched=true;},getConnection(){touched=true;}});
 await assert.rejects(service.submit({...payload,reason:'Hidden service'}),e=>e.status===400);
 assert.equal(touched,false);
});
