const {test}=require('node:test');
const assert=require('node:assert/strict');
const register=require('./office-services');

function response(current,env) {
 let handler,body;
 const app={get(route,fn){assert.deepEqual(route,['/office-services.js','/portal-assets/office-services.js']);handler=fn;}};
 register(app,current,env);
 const res={set(key,value){assert.equal(key,'Cache-Control');assert.equal(value,'no-store');},
  type(){return this;},send(value){body=value;}};
 handler({},res);
 return JSON.parse(body.slice('window.officeServiceOrigins='.length,-1));
}
test('separate Render services expose public destinations, never private connection variables',()=>{
 const env={RENDER_EXTERNAL_URL:'https://queue.example.test',PERMIT_PUBLIC_ORIGIN:'https://permits.example.test/',
  PERMIT_DATABASE_URL:'private-permit-secret',QUEUE_DATABASE_URL:'private-queue-secret',CLOUDINARY_API_SECRET:'private-video-secret'};
 assert.deepEqual(response('queue',env),{current:'queue',permits:'https://permits.example.test',queue:'https://queue.example.test'});
 assert.deepEqual(response('permits',{...env,RENDER_EXTERNAL_URL:'https://permits.example.test',QUEUE_PUBLIC_ORIGIN:'https://queue.example.test'}),
  {current:'permits',permits:'https://permits.example.test',queue:'https://queue.example.test'});
});
test('local destinations remain unset so the portal uses the current office hostname and ports',()=>{
 assert.deepEqual(response('queue',{}),{permits:null,queue:null});
});
test('invalid or secret-bearing public origins fail without echoing their value',()=>{
 for (const value of ['https://user:private-secret@example.test','https://example.test/login','javascript:private-secret','https://example.test/?private-secret'])
  assert.throws(()=>response('permits',{QUEUE_PUBLIC_ORIGIN:value}),error=>{
   assert.match(error.message,/QUEUE_PUBLIC_ORIGIN/);assert.ok(!error.message.includes('private-secret'));return true;
  });
});
