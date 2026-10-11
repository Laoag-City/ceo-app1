const test=require('node:test');
const assert=require('node:assert/strict');
const {fromSnapshot,capture}=require('./projectChanges');
test('routing history shows only changed fields and preserves old/new values',()=>{
    const before={matrix:[{id:1,discipline_name:'Line & Grade',engineer_name:'Majin',signature_status:'Pending',feedback_remarks:''}]};
    assert.deepEqual(fromSnapshot(before,{updatedMatrixRows:[{id:1,engineer_name:'Majin',signature_status:'Approved',feedback_remarks:''}]}),[{field:'Line & Grade · Status',before:'Pending',after:'Approved'}]);
    assert.deepEqual(fromSnapshot(before,{updatedMatrixRows:[{id:2,signature_status:'Approved'}]}),[]);
});
test('detail history handles names, lots, and unchanged calendar dates',()=>{
    const diff=fromSnapshot({owner_name:'Majin',permit_date:'2026-09-15T00:00:00.000Z',lot_numbers:['1']},{owner_name:'Gamo',permit_date:'2026-09-15',lot_numbers:['1','2']});
    assert.deepEqual(diff,[{field:'Owner',before:'Majin',after:'Gamo'},{field:'Lots',before:'1',after:'1, 2'}]);
});

test('combined signature history includes date changes and preserves omitted dates',()=>{
    const before={matrix:[{id:1,discipline_name:'Electrical',sub_permit_id:7,signature_status:'Pending',date_checked:new Date(2026,0,1),date_approved:null}]};
    const row={id:1,signature_status:'Approved',date_checked:'2026-01-01',date_approved:'2026-01-02'};
    assert.deepEqual(fromSnapshot(before,{updatedMatrixRows:[row]}),[
        {field:'Electrical (sub-permit #7) · Status',before:'Pending',after:'Approved'},
        {field:'Electrical (sub-permit #7) · Date Approved',before:'',after:'2026-01-02'}
    ]);
    assert.deepEqual(fromSnapshot(before,{updatedMatrixRows:[{id:1,signature_status:'Pending'}]}),[]);
});
test('requirements history uses readable names and received status',async()=>{
    const diff=await capture(async()=>[{checklist_state:'{"cl03":false}'}],'occupancy',10,'/api/occupancy/10/checklist',{checklist_state:{cl03:true}});
    assert.equal(diff[0].field,'Certificate of Final Electrical Inspection (CFEI)');assert.equal(diff[0].before,'Not received');assert.equal(diff[0].after,'Received');
});
