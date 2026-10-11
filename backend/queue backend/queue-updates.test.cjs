const {test}=require('node:test');
const assert=require('node:assert/strict');
const createUpdates=require('./queue-updates');
const createDelivery=require('./queue-visibility');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const state=ids=>({queue:ids.map(id=>({id,name:'Private'})),waiting:[],onHold:[],serving:[],finished:[],nowServing:null});

test('initial connections and concurrent broadcasts cannot deliver older snapshots last',async()=>{
 let release,lookups=0,reads=0;
 const emitted=[];
 const deliver=createDelivery({async resolve(req,res,next){
  if(++lookups===1)await new Promise(resolve=>release=resolve);
  req.user={role:'operator'};next();
 }});
 const socket={request:{headers:{}},emit(event,payload){emitted.push(payload.queue.map(ticket=>ticket.id));}};
 let current=state(['TKT-1']);
 const updates=createUpdates(async()=>{reads++;return current;},deliver,()=>[socket]);
 const initial=updates.connect(socket);await tick();
 current=state(['TKT-1','TKT-2']);
 const broadcast=updates.broadcast();await tick();
 assert.equal(reads,1,'The newer read waits until initial delivery finishes');
 assert.equal(emitted.length,0);
 release();await Promise.all([initial,broadcast]);
 assert.deepEqual(emitted,[['TKT-1'],['TKT-1','TKT-2']]);
});

test('failed reads and individual socket failures do not prevent future broadcasts',async()=>{
 let failRead=true,failDelivery=true;
 const seen=[];
 const updates=createUpdates(async()=>{if(failRead)throw Error('Database unavailable');return state(['TKT-2']);},
  async socket=>{if(socket.id===1 && failDelivery)throw Error('Lookup unavailable');seen.push(socket.id);},
  ()=>[{id:1},{id:2},{id:3,disconnected:true}]);
 await assert.rejects(updates.broadcast(),/Database unavailable/);
 failRead=false;await assert.rejects(updates.broadcast(),/display could not/);
 assert.deepEqual(seen,[2]);
 failDelivery=false;await updates.broadcast();assert.deepEqual(seen,[2,1,2]);
});
