const {test}=require('node:test'),assert=require('node:assert/strict');
const {createReader}=require('./permitAddedAt');
test('system-added date validates the record scope before touching the database',async()=>{
    let touched=false;const read=createReader({query:async()=>{touched=true;throw Error('Must not query');}});
    for(const [kind,id] of [['__proto__','1'],['users','1'],['permits','1;DROP'],['occupancy','0'],['occupancy','1e2'],['permits','9007199254740993']])await assert.rejects(read(kind,id),e=>e.status===400);
    assert.equal(touched,false);
});
require('../database/permit-added-at.scenarios.cjs')(()=>require('mysql2/promise').createConnection({host:'localhost',user:'root',database:'permit_system'}),'mysql');
