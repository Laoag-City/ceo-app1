const {test}=require('node:test');
const assert=require('node:assert/strict');
const access=require('./occupancyWorkspaceAccess');
function check(role,method,path) {
    let passed=false;
    const res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    access({user:role?{role}:undefined,method,path},res,()=>{passed=true;});
    return {passed,...res};
}
test('admins may reach assigned-station saves and existing reviews, with unrelated occupancy writes blocked',()=>{
    for(const path of ['/10/signatures','/10/signatures/'])assert.equal(check('admin','PUT',path).passed,true);
    for(const path of ['/change-requests/12/approve','/change-requests/12/reject','/10/final-review'])assert.equal(check('admin','PUT',path).passed,true);
    for(const [method,path] of [
        ['POST','/'],['DELETE','/10'],['PUT','/10'],['PUT','/10/checklist'],
        ['POST','/10/inspections'],['PUT','/10/inspections/2'],['DELETE','/10/inspections/2'],
        ['POST','/matrix/add'],['DELETE','/matrix/remove'],['POST','/10/stations/initialize'],
        ['POST','/10/signatures'],['PATCH','/10/signatures'],['DELETE','/10/signatures'],
        ['PUT','/10/signatures/extra'],['PUT','/not-an-id/signatures']
    ]) {
        const result=check('admin',method,path);
        assert.equal(result.passed,false,method+' '+path);assert.equal(result.code,403);
    }
});
test('operator write access and staff read access are retained; IT gains no station write exception',()=>{
    for(const path of ['/','/10/checklist','/10/signatures','/10/inspections/2','/matrix/add']) {
        assert.equal(check('operator','PUT',path).passed,true);
        for(const role of ['operator','admin','superadmin'])assert.equal(check(role,'GET',path).passed,true);
    }
    for(const role of ['superadmin',null])assert.equal(check(role,'PUT','/10/signatures').code,403);
});
