const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('reset rejects missing or incorrect confirmation before any database operation',async()=>{
 const source=fs.readFileSync(__dirname+'/queueServer.js','utf8');const start=source.indexOf("app.post('/api/system/reset'");const end=source.indexOf('// 10.',start);let handler,calls=0;
 vm.runInNewContext(source.slice(start,end),{app:{post:(route,...handlers)=>handler=handlers.at(-1)},queueAuth:{protectWrite(){}},sessions:{requireRoles:()=>()=>{}},db:{query:()=>{calls++;throw Error('Database must not run')}},ticketSubmissions:{invalidate:()=>{calls++;throw Error('Must not invalidate')}}});
 for(const confirmation of [undefined,'reset','RESET ']){let status,body;await handler({body:{confirmation}},{status(code){status=code;return this},json(data){body=data;return this}});assert.equal(status,400);assert.equal(body.success,false);}assert.equal(calls,0);
});
