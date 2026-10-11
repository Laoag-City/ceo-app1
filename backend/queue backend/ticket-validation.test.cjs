const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateTicket,createTicketSubmission}=require('./ticket-submission');
const {tasks}=require('./queue-services');
const payload={requestId:'11111111-1111-4111-8111-111111111111',name:'Test Visitor',phone:'09123456789',email:'',barangay:'Test address',reason:'Inquire'};

test('all workstation services remain available and unsupported services are rejected',()=>{
 for(const reason of Object.values(tasks).flat())assert.equal(validateTicket({...payload,reason}).reason,reason);
 for(const reason of ['Unknown','Releasing Bldg. Permit EXTRA',''])assert.throws(()=>validateTicket({...payload,reason}),error=>error.status===400);
});
test('ticket field boundaries match database widths, including Unicode',()=>{
 for(const [key,limit] of Object.entries({name:255,phone:50,email:255,barangay:255})) {
  assert.equal(Array.from(validateTicket({...payload,[key]:'😀'.repeat(limit)})[key]).length,limit);
  assert.throws(()=>validateTicket({...payload,[key]:'a'.repeat(limit+1)}),error=>error.status===400);
 }
 assert.equal(validateTicket({...payload,email:undefined}).email,'');
 for(const value of [null,[],42,{...payload,phone:12},{...payload,name:'a\0b'}])assert.throws(()=>validateTicket(value),error=>error.status===400);
});
test('invalid tickets are rejected before schema queries or database writes',async()=>{
 let touched=false;
 const service=createTicketSubmission({query(){touched=true;},getConnection(){touched=true;}});
 await assert.rejects(service.submit({...payload,phone:'a'.repeat(51)}),error=>error.status===400);
 await assert.rejects(service.submit({...payload,reason:'Hidden service'}),error=>error.status===400);
 assert.equal(touched,false);
});
