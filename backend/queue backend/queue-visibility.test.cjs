const {test}=require('node:test');
const assert=require('node:assert/strict');
const createDelivery=require('./queue-visibility');
const {createPermitSessions}=require('../monitorBP backend/permitSessions');
const crypto=require('node:crypto');

test('public sockets receive ticket numbers while staff details are revoked after logout or role changes',async()=>{
 const token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
 const createdAt=new Date();
 let account={id:1,username:'test-staff',role:'operator',created_at:createdAt,expires_at:new Date(createdAt.getTime()+30*60*1000)};
 const db={promise:()=>({query:async(sql,args)=>[args[0]===hash&&account?[account]:[]]})};
 const deliver=createDelivery(createPermitSessions(db,{cookieName:'queue_session'}));
 const ticket={id:'TKT-1',name:'Private Name',phone:'Private Phone',email:'Private Email',barangay:'Private Address',reason:'Inquire',calledBy:'PC3'};
 const state={queue:[ticket],waiting:[ticket],onHold:[ticket],serving:[ticket],finished:[ticket],nowServing:ticket};
 let received;
 const socket={request:{headers:{}},handshake:{auth:{role:'superadmin'}},emit(event,data){assert.equal(event,'queueUpdate');received=data;}};
 async function expectPublic() {
  await deliver(socket,state);
  assert.equal(received.waiting[0].id,'TKT-1');assert.equal(received.serving[0].calledBy,'PC3');
  assert.deepEqual(received.finished,[]);assert.ok(!JSON.stringify(received).includes('Private'));
 }
 await expectPublic();
 socket.request.headers.cookie='permit_session='+token;await expectPublic();
 socket.request.headers.cookie='queue_session='+token;await deliver(socket,state);assert.equal(received.waiting[0].phone,'Private Phone');
 account.role='visitor';await expectPublic();
 account=null;await expectPublic();
});
test('session lookup failure keeps a socket public',async()=>{
 let received;
 const deliver=createDelivery({async resolve(req,res){res.status(503).json({});}});
 const state={queue:[],waiting:[],onHold:[],serving:[],finished:[{name:'Private'}],nowServing:null};
 await deliver({request:{headers:{cookie:'anything'}},emit(event,data){received=data;}},state);
 assert.deepEqual(received.finished,[]);
});
