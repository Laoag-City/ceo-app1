const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
test('overview enforces roles, limits account counts to superadmin and reports query failures',async()=>{
    let fail=false,accountReads=0;
    const db={promise:()=>({query:async sql=>{
        if(fail)throw new Error('database unavailable');
        if(sql.includes('FROM users')){accountReads++;return [[{total:4,pending:1}]]}
        if(sql.includes('UNION ALL'))return [[{id:1,kind:'permits',project_title:'Test',status:'pending'}]];
        return [[{building:10,occupancy:4,buildingPending:2,occupancyPending:1,buildingDeletions:1,occupancyDeletions:0}]];
    }})};
    const sessions={requireRoles:(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(req.user?403:401).end()};
    const app=express();app.use((req,res,next)=>{if(req.get('test-role'))req.user={role:req.get('test-role')};next()});app.use(require('./adminOverview')(db,sessions));
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const get=(role,path='overview')=>fetch(`http://127.0.0.1:${server.address().port}/admin/${path}`,{headers:role?{'test-role':role}:{}});
    try{
        assert.equal((await get()).status,401);assert.equal((await get('operator')).status,403);
        const admin=await (await get('admin')).json();assert.equal(admin.totals.building,10);assert.equal(admin.totals.accounts,undefined);assert.equal(accountReads,0);
        const superadmin=await (await get('superadmin')).json();assert.equal(superadmin.totals.pendingAccounts,1);assert.equal(superadmin.totals.building,undefined);assert.deepEqual(superadmin.recent,[]);assert.equal(accountReads,1);
        assert.equal((await get(undefined,'history')).status,401);assert.equal((await get('operator','history')).status,403);assert.equal((await get('superadmin','history')).status,403);
        const history=await get('admin','history');assert.equal(history.status,200);assert.equal(history.headers.get('cache-control'),'no-store');assert.equal((await history.json()).records.length,1);
        assert.equal((await get('admin','history?kind=users')).status,400);
        fail=true;assert.equal((await get('admin')).status,503);
        assert.equal((await get('admin','history')).status,503);
    }finally{await new Promise(resolve=>server.close(resolve))}
});
