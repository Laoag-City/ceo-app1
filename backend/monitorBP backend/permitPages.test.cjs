const {test} = require('node:test');
const assert = require('node:assert/strict');
const middleware = require('./permitPages')(__dirname);

// Test redirects before any HTML read. Authentication is supplied by the
// existing session middleware in production; these are isolated request fixtures.
for(const [role, destination] of [[null,'/login'],['operator','/index.html'],['admin','/admin'],['superadmin','/superadmin']]) {
    test(`retired chooser redirects ${role || 'signed-out visitor'} without reading a deleted file`, () => {
        for(const url of ['/permit-access.html','/PERMIT-ACCESS.HTML','/%70ermit-access.html/']) {
            const headers = {};
            let redirect;
            middleware({path:url,user:role ? {role} : undefined}, {
                set(key,value){headers[key]=value;},
                redirect(value){redirect=value;}
            },()=>assert.fail('Retired chooser must not fall through to static files'));
            assert.equal(redirect,destination);
            assert.equal(headers['Cache-Control'],'no-store');
        }
    });
}

test('a protected-page redirect consumes only the invalid cookie and retains its one-time explanation',()=>{
 let clears=0,redirect;
 const gate=require('./permitPages')(__dirname,{clearCookie(){clears++;}});
 gate({path:'/index.html',user:null,sessionReplaced:true},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Protected registry must redirect'));
 assert.equal(redirect,'/login?session=replaced');assert.equal(clears,1);
 gate({path:'/index.html',user:null,sessionReplaced:false},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Protected registry must redirect'));
 assert.equal(redirect,'/login');assert.equal(clears,2);
 gate({path:'/admin',user:{role:'operator'}},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Wrong role must redirect'));
 assert.equal(redirect,'/index.html');assert.equal(clears,2,'A valid session is never cleared');
});

test('the main URL opens the public portal for visitors and every staff role',()=>{
 for(const role of [null,'operator','admin','superadmin']) {
  let redirect;
  middleware({path:'/',user:role?{id:1,role}:null}, {
   redirect(value){redirect=value;}
  },()=>assert.fail('The root must not expose the static Building registry'));
  assert.equal(redirect,'/portal.html');
 }
});

test('normalized Building registry URLs remain protected',()=>{
 for(const url of ['/index.html','/INDEX.HTML','/%69ndex.html/','/directory/../index.html']) {
  let redirect;
  middleware({path:url,user:null},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Registry must require login'));
  assert.equal(redirect,'/login');
 }
});

test('the Express static-file boundary keeps the portal public and the registry protected',async()=>{
 const express=require('express');
 const path=require('node:path');
 const app=express(),frontend=path.resolve(__dirname,'../../frontend/monitorBP frontend');
 app.use(require('./permitPages')(frontend));
 app.use(express.static(frontend));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try {
  const root=await fetch(origin+'/',{redirect:'manual'});
  assert.equal(root.status,302);assert.equal(root.headers.get('location'),'/portal.html');
  const portal=await fetch(origin+root.headers.get('location'));
  assert.equal(portal.status,200);assert.match(await portal.text(),/portal-assets/);
  const registry=await fetch(origin+'/index.html',{redirect:'manual'});
  assert.equal(registry.status,302);assert.equal(registry.headers.get('location'),'/login');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('admins and operators can open both registries/details while IT remains in its own workspace',async()=>{
 const path=require('node:path');
 const gate=require('./permitPages')(path.resolve(__dirname,'../../frontend/monitorBP frontend'));
 for(const url of ['/index.html','/edit','/edit.html','/occupancy','/occupancy.html','/occupancy/edit','/occupancy_edit.html']) {
  for(const role of ['operator','admin']) {
   const result=await new Promise((resolve,reject)=>{
    const res={set(){},type(){return this;},send(html){resolve({html});},redirect(location){resolve({location});}};
    gate({path:url,user:{id:2,username:'Example',role}},res,error=>reject(error || Error('Protected page fell through')));
   });
   assert.ok(result.html?.includes('sessionStorage.setItem("oboUser"'),role+' '+url);
   assert.ok(result.html.includes('Example'));
  }
  let redirect;
  gate({path:url,user:{id:3,role:'superadmin'}},{set(){},redirect(location){redirect=location;}},()=>assert.fail('IT must not gain registry access'));
  assert.equal(redirect,'/superadmin');
 }
 for(const [url,role,destination] of [['/admin','superadmin','/superadmin'],['/superadmin','admin','/admin'],['/superadmin','operator','/index.html']]) {
  let redirect;
  gate({path:url,user:{id:2,role}},{set(){},redirect(location){redirect=location;}},()=>assert.fail('Role-specific workspace fell through'));
  assert.equal(redirect,destination);
 }
});
