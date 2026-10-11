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
