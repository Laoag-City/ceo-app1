const {test} = require('node:test');
const assert = require('node:assert/strict');
const middleware = require('./permitPages')(__dirname);

// Test redirects before any HTML read. Authentication is supplied by the
// existing session middleware in production; these are isolated request fixtures.
for(const [role, destination] of [[null,'/login'],['operator','/'],['admin','/admin'],['superadmin','/superadmin']]) {
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
 gate({path:'/',user:null,sessionReplaced:true},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Protected root must redirect'));
 assert.equal(redirect,'/login?session=replaced');assert.equal(clears,1);
 gate({path:'/',user:null,sessionReplaced:false},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Protected root must redirect'));
 assert.equal(redirect,'/login');assert.equal(clears,2);
 gate({path:'/admin',user:{role:'operator'}},{set(){},redirect(value){redirect=value;}},()=>assert.fail('Wrong role must redirect'));
 assert.equal(redirect,'/');assert.equal(clears,2,'A valid session is never cleared');
});
