const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(fetchImpl,online=true,fastTimeout=false){
 const storage=new Map(),nodes=[];let box;
 function node(tag){const n={tag,children:[],append(...items){this.children.push(...items);if(this.tag==='body')box=items[0]},replaceChildren(){this.children=[]},setAttribute(){},remove(){if(this===box)box=null;}};nodes.push(n);return n;}
 const window={fetch:fetchImpl,addEventListener(){}};
 const context={window,document:{getElementById:()=>box,createElement:node,body:node('body')},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{href:'http://localhost:3000/'},navigator:{onLine:online},URL,FormData,AbortController,confirm:()=>true,setTimeout:fastTimeout?(f)=>setTimeout(f,5):setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/permits/request-feedback.js','utf8'),context);
 return {api:window.RequestFeedback,storage,nodes};
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('offline prevents sending a write and leaves it retryable',async()=>{let calls=0;const f=setup(async()=>{calls++;},false);await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/Nothing was sent/);assert.equal(calls,0);assert.equal(f.storage.has('unconfirmedRequests'),false);});
test('lost write response blocks a second POST without discarding its uncertainty',async()=>{let calls=0;const f=setup(async()=>{calls++;throw new TypeError('failed')});await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/unconfirmed/);await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/previous action/);assert.equal(calls,1);assert.match(f.storage.get('unconfirmedRequests'),/permits/);});
test('queue ticket retries are safe with the same request ID',async()=>{let calls=0;const f=setup(async()=>{if(++calls===1)throw Error('lost');return json({success:true,ticketId:'TKT-1',duplicate:true})});const options={method:'POST',body:JSON.stringify({requestId:'same-token'})};await assert.rejects(f.api.fetch('/api/tickets',options),/same form/);const r=await f.api.fetch('/api/tickets',options);assert.equal((await r.json()).ticketId,'TKT-1');assert.equal(calls,2);});
test('validation responses permit correction and another attempt',async()=>{let calls=0;const f=setup(async()=>++calls===1?json({success:false,message:'Date is required'},400):json({success:true}));await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/Date is required/);assert.equal((await f.api.fetch('/api/permits',{method:'POST'})).ok,true);});
test('malformed write response stays uncertain; valid reads and duplicate responses remain compatible',async()=>{const f=setup(async url=>url.includes('bad')?new Response('<html>broken</html>'):url.includes('duplicate')?json({duplicate:true,success:false},409):json([{id:1}]));await assert.rejects(f.api.fetch('/bad',{method:'POST'}),/unconfirmed/);assert.deepEqual(await (await f.api.fetch('/read')).json(),[{id:1}]);assert.equal((await f.api.fetch('/duplicate')).status,409);});
test('timeouts abort the request and release the transport',async()=>{const f=setup((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error(),{name:'AbortError'})))),true,true);await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/too long/);});
test('server status check cannot unlock an uncertain write without explicit review confirmation',async()=>{let writes=0,reads=0;const f=setup(async(url,options)=>{if(options.method==='POST'){writes++;throw Error('lost')}reads++;return json([])});await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}));const check=f.nodes.find(n=>n.textContent==='Check server status');await check.onclick();assert.equal(reads,1);await assert.rejects(f.api.fetch('/api/permits',{method:'POST'}),/previous action/);assert.equal(writes,1);});


test('stale approval remains a conflict and does not become an uncertain save',async()=>{
 const f=setup(async()=>json({success:false,conflict:true,message:'Outdated request. Submit a fresh request.'},409));
 await assert.rejects(f.api.fetch('/api/permits/change-requests/2/approve',{method:'PUT'}),e=>e.conflict===true&&e.message==='Outdated request. Submit a fresh request.');
 assert.equal(f.storage.has('unconfirmedRequests'),false);
});
