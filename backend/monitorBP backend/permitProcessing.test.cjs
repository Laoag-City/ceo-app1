const {test}=require('node:test');
const assert=require('node:assert/strict');
const {creationFields,summarize,omitUnset}=require('./permitProcessing');

const friday='2026-11-20';
const scenario=(category,now,finalApproval,start=friday)=>summarize({
    processing_time:category,processing_started_on:start
},finalApproval,new Date(now));

test('each category counts weekdays after system registration in Manila',()=>{
    for(const [category,total,due] of [
        ['simple',3,'2026-11-25'],
        ['complex',7,'2026-12-01'],
        ['highly_technical',20,'2026-12-18']
    ]) {
        const original=scenario(category,'2026-11-19T16:00:00Z');
        assert.equal(original.due_on,due);
        assert.equal(original.working_days,total);
        assert.equal(original.remaining_working_days,total);
        assert.equal(scenario(category,'2026-11-22T13:00:00Z').remaining_working_days,total);
        assert.equal(scenario(category,'2026-11-22T16:00:00Z').remaining_working_days,total-1);
    }
    assert.equal(scenario('simple','2026-11-21T07:00:00Z',null,'2026-11-21').due_on,'2026-11-25');
});

test('deadlines distinguish due today, past due, and completed permits',()=>{
    const due=scenario('simple','2026-11-24T16:00:00Z');
    assert.equal(due.status,'due_today');
    assert.equal(due.remaining_working_days,0);
    const overdue=scenario('simple','2026-11-29T16:00:00Z');
    assert.equal(overdue.status,'overdue');
    assert.equal(overdue.overdue_working_days,3);
    const finalApproval={status:'approved',history:[{current:true,created_at:'2026-11-23T02:30:00Z'}]};
    const completed=scenario('simple','2026-12-15T08:00:00Z',finalApproval);
    assert.equal(completed.status,'completed');
    assert.equal(completed.remaining_working_days,2);
    finalApproval.history[0].created_at='2026-11-27T03:00:00Z';
    const late=scenario('simple','2026-12-15T08:00:00Z',finalApproval);
    assert.equal(late.status,'completed_late');
    assert.equal(late.overdue_working_days,2);
});

test('legacy permits stay unclassified and invalid classifications are rejected',()=>{
    assert.deepEqual(creationFields({}),{});
    assert.deepEqual(creationFields({processing_time:'complex'}),{processing_time:'complex'});
    for(const processing_time of ['','toString','4',null,3,[]]) {
        assert.throws(()=>creationFields({processing_time}),{status:400});
    }
    assert.equal(summarize({permit_date:friday}),null);
    assert.deepEqual(omitUnset({id:4,processing_time:null,processing_started_on:null}),{id:4});
    assert.deepEqual(scenario('simple','2026-11-20T01:00:00Z',null,null),{category:'Simple',working_days:3});
});
