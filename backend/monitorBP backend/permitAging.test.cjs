const {test}=require('node:test'),assert=require('node:assert/strict');
const aging=require('./permitAging');
const today='2026-11-04';
const building={id:1,permit_date:'2026-09-01'},occupancy={id:1,date_applied:'2026-09-01'};
test('office dates follow Manila midnight, independent of the host time zone',()=>{
    assert.equal(aging.officeToday(new Date('2026-11-03T15:59:59Z')),'2026-11-03');
    assert.equal(aging.officeToday(new Date('2026-11-03T16:00:00Z')),'2026-11-04');
});
test('calendar validation handles leap days, impossible dates and missing fields',()=>{
    assert.equal(aging.calendar('2024-02-29'),'2024-02-29');
    for(const value of [null,undefined,'2026-02-29','2026-11-31','bad','2026-11-04T00:00:00Z',new Date(NaN)])assert.equal(aging.calendar(value),null);
    assert.equal(aging.calendar(new Date(2026,10,4)),'2026-11-04');
});
test('both registries use the correct filing field and exact follow-up boundaries',()=>{
    for(const [kind,record] of [['permits',building],['occupancy',occupancy]]) {
        for(const [activity,idle,status] of [['2026-11-04',0,'normal'],['2026-10-22',13,'normal'],['2026-10-21',14,'followup'],['2026-10-06',29,'followup'],['2026-10-05',30,'overdue']]) {
            const result=aging.summarize(record,kind,activity,{today});
            assert.equal(result.age_days,64);assert.equal(result.inactive_days,idle);assert.equal(result.status,status);assert.equal(result.basis,'activity');
        }
    }
});
test('missing activity falls back explicitly to filing; dates never produce negative ages',()=>{
    const result=aging.summarize({permit_date:'2026-10-01'},'permits',null,{today});
    assert.equal(result.inactive_days,34);assert.equal(result.basis,'filing');assert.equal(result.status,'overdue');
    assert.equal(aging.summarize({permit_date:today},'permits','2026-01-01',{today}).inactive_days,0);
    for(const [filed,activity] of [[null,null],['2026-11-05',null],['bad',null],[today,'2026-11-05']]) {
        const result=aging.summarize({permit_date:filed},'permits',activity,{today});
        assert.equal(result.status,'unknown');assert.equal(result.inactive_days,null);assert.ok(result.age_days===null || result.age_days>=0);
    }
});
test('only current final approval stops reminders; corrections and ready-for-review still age',()=>{
    assert.equal(aging.summarize({...building,final_approval:{status:'approved'}},'permits',null,{today}).status,'completed');
    assert.equal(aging.summarize({...building,final_approval:{status:'approved'}},'permits',null,{today}).inactive_days,null);
    for(const status of ['in_review','ready','returned','correction'])assert.equal(aging.summarize({...building,final_approval:{status}},'permits',null,{today}).status,'overdue');
});
test('thresholds are configurable and reject invalid or reversed values',()=>{
    assert.deepEqual(aging.policyFromEnv({}),{followup_days:14,overdue_days:30});
    const thresholds=aging.policyFromEnv({PERMIT_AGING_FOLLOWUP_DAYS:'7',PERMIT_AGING_OVERDUE_DAYS:'14'});
    assert.equal(aging.summarize(building,'permits','2026-10-21',{today,thresholds}).status,'overdue');
    for(const value of ['-1','0','14.5','abc','3651',' 14'])assert.throws(()=>aging.policyFromEnv({PERMIT_AGING_FOLLOWUP_DAYS:value}));
    assert.throws(()=>aging.policyFromEnv({PERMIT_AGING_FOLLOWUP_DAYS:'30',PERMIT_AGING_OVERDUE_DAYS:'14'}));
    assert.throws(()=>aging.summarize(building,'unknown',null,{today}));
});
test('decoration is one read per registry, does not mutate records and propagates database failure',async()=>{
    let calls=0;const records=[building,{id:2,permit_date:'2026-10-01'}];
    const conn={async query(sql,args){calls++;assert.match(sql,/outcome='saved'/);assert.match(sql,/category='activity'/);assert.deepEqual(args,['permits']);return [[{project_id:1,last_activity_date:'2026-11-03'}]];}};
    assert.deepEqual(await aging.decorate(conn,'permits',[],{today}),[]);assert.equal(calls,0);
    const result=await aging.decorate(conn,'permits',records,{today});assert.equal(calls,1);assert.equal(result[0].aging.inactive_days,1);assert.equal(result[1].aging.basis,'filing');assert.ok(!records[0].aging);
    await assert.rejects(aging.decorate({query:async()=>{throw Error('offline')}},'permits',records,{today}),/offline/);
});
