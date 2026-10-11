const test = require('node:test');
const assert = require('node:assert/strict');
const createWorkflow = require('./deletionWorkflow');
function setup(kind) {
    const state = { record: true, request: null, deletes: 0 };
    const db = { query(sql, params, cb) {
        let result;
        if (sql.startsWith('SELECT id, role FROM users')) result = [{ id: params[0], role: params[0] === 1 ? 'operator' : params[0] === 3 ? 'superadmin' : 'admin' }];
        else if (sql.startsWith('SELECT id FROM')) result = state.record ? [{id:10}] : [];
        else if (sql.startsWith('INSERT INTO')) {
            const exists = state.request?.status === 'pending';
            if (!exists) state.request = {id:20,change_type:'delete',status:'pending'};
            result = {affectedRows: exists ? 0 : 1};
        } else if (sql.startsWith('SELECT * FROM')) result = state.request ? [state.request] : [];
        else if (sql.startsWith('DELETE p FROM')) {
            assert(sql.includes("r.status = 'pending'"));
            result = {affectedRows:state.record && state.request?.status === 'pending' ? 1 : 0};
            if(result.affectedRows){state.record=false;state.request=null;state.deletes++;}
        } else if (sql.startsWith('UPDATE')) {
            assert(sql.includes("status = 'pending'"));
            state.request.status='rejected';result={affectedRows:1};
        } else throw Error(sql);
        cb(null,result);
    }};
    const workflow=createWorkflow(db);
    async function call(action, user=1, role=user===1?'operator':user===3?'superadmin':'admin') {
        const res={code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};
        const req={user:{id:user,role},params:{id:action==='submit'?'10':'20'},get(name){return name==='x-user-id'?String(user):role}};
        let next=false;
        await (action==='submit'?workflow.submit(kind):workflow.review(kind,action))(req,res,()=>{next=true});
        return {...res,next};
    }
    return {state,call};
}
for (const kind of ['permits','occupancy']) {
    test(kind+': request retains record, duplicate remains pending, operator cannot approve, admin can',async()=>{
        const {state,call}=setup(kind);
        assert.equal((await call('submit')).body.pending,true);assert(state.record);assert.equal(state.deletes,0);
        assert.match((await call('submit')).body.message,/already/);
        assert.equal((await call('approve')).code,403);assert(state.record);
        assert.equal((await call('approve',1,'admin')).code,403);assert(state.record);
        assert.equal((await call('approve',2)).body.success,true);assert.equal(state.record,false);assert.equal(state.deletes,1);
        assert.equal((await call('approve',2)).code,404);
    });
    test(kind+': decline retains record and blocks later approval; a new request is allowed',async()=>{
        const {state,call}=setup(kind);await call('submit');
        assert.equal((await call('reject',2)).body.success,true);assert(state.record);
        assert.equal((await call('approve',2)).code,409);assert.equal(state.deletes,0);
        assert.equal((await call('submit')).body.pending,true);
    });
    test(kind+': superadmin can approve deletion',async()=>{
        const {state,call}=setup(kind);await call('submit');
        assert.equal((await call('approve',3)).body.success,true);assert.equal(state.record,false);
    });
    test(kind+': missing records are rejected and edit requests continue to existing handler',async()=>{
        const {state,call}=setup(kind);state.record=false;
        assert.equal((await call('submit')).code,404);
        state.request={change_type:'matrix_update',status:'pending'};
        assert.equal((await call('approve',2)).next,true);
    });
}
