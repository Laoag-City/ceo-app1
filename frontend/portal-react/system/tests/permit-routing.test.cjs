const {test}=require('node:test');
const assert=require('node:assert/strict');
const {home,redirectFor}=require('../assets/permits/permit-routing.js');
const user=role=>({id:1,role});
test('each supported role has its own landing page',()=>{
 assert.equal(home(user('operator')),'/index.html');
 assert.equal(home(user('admin')),'/admin');
 assert.equal(home(user('superadmin')),'/superadmin');
 for(const invalid of [null,{},user('unknown'),{id:0,role:'admin'}])assert.equal(home(invalid),'/login');
});
test('operator pages require operator and protected pages require login',()=>{
 assert.equal(redirectFor('operator','/index.html',user('operator')),null);
 assert.equal(redirectFor('operator','/occupancy',user('admin')),'/admin');
 assert.equal(redirectFor('operator','/edit',null),'/login');
 assert.equal(redirectFor('dashboard','/admin',null),'/login');
});
test('dashboard destinations reject other roles and canonicalize old URLs',()=>{
 assert.equal(redirectFor('dashboard','/admin',user('admin')),null);
 assert.equal(redirectFor('dashboard','/superadmin',user('superadmin')),null);
 assert.equal(redirectFor('dashboard','/superadmin',user('admin')),'/admin');
 assert.equal(redirectFor('dashboard','/admin',user('superadmin')),'/superadmin');
 assert.equal(redirectFor('dashboard','/superadmin',user('operator')),'/index.html');
});
test('old login bookmarks converge on shared login',()=>{
 assert.equal(redirectFor('legacy-login','/admin-login.html',null),'/login');
 assert.equal(redirectFor('login','/login',null),null);
});
