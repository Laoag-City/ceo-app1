const test=require('node:test');const assert=require('node:assert/strict');
const {validate,calendar,migrate}=require('./stationDates');
test('calendar validation rejects future, impossible and reversed dates',()=>{
    const today='2026-09-15';
    for(const dates of [{date_checked:'2026-09-16',date_approved:''},{date_checked:'2026-02-30',date_approved:''},{date_checked:'',date_approved:'2026-09-01'},{date_checked:'2026-09-02',date_approved:'2026-09-01'},{date_checked:undefined,date_approved:''}])assert.throws(()=>validate(dates,today));
    assert.doesNotThrow(()=>validate({date_checked:'2026-09-01',date_approved:'2026-09-01'},today));
    assert.doesNotThrow(()=>validate({date_checked:'',date_approved:''},today));
    assert.equal(calendar(new Date(2026,8,15)), '2026-09-15');
});
test('migration is additive and repeatable on both tables',async()=>{
    const columns=new Set();let alterations=0;
    const db={query:async(sql,args)=>{
        if(sql.startsWith('SHOW'))return [columns.has(sql.split(' ')[3]+args[0])?[{}]:[]];
        const parts=sql.split(' ');assert.match(sql,/ADD COLUMN date_(checked|approved) DATE NULL$/);columns.add(parts[2]+parts[5]);alterations++;return [{}];
    }};
    await migrate(db);await migrate(db);assert.equal(alterations,4);
});
