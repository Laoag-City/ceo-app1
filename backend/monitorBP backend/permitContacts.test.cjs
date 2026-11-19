const {test}=require('node:test'),assert=require('node:assert/strict');
const validation=require('./permitValidation'),transfer=require('./permitTransfer');
const finalApproval=require('./finalApproval'),requests=require('./permitCreationRequests'),{hash}=require('./permitDuplicates');
const fixtures={
    permits:{project_title:'Annex',location:'Laoag',owner_name:'Applicant',designer_name:'Designer',permit_date:'2026-11-19'},
    occupancy:{project_title:'Annex',location:'Laoag',owner_name:'Applicant',bp_reference_no:'BP-1',date_applied:'2026-11-19'}
};
for(const kind of Object.keys(fixtures))test(kind+': contacts are optional and partial corrections leave other fields untouched',()=>{
    assert.equal(validation.metadata(kind,fixtures[kind]).phone_number,'');
    assert.equal(validation.metadata(kind,fixtures[kind]).email,'');
    assert.deepEqual(validation.metadata(kind,{phone_number:' +63 917 123 4567 ',email:' person@example.com '},undefined,true),{phone_number:'+63 917 123 4567',email:'person@example.com'});
    assert.deepEqual(validation.metadata(kind,{email:null},undefined,true),{email:''});
    for(const patch of [{email:'bad'},{email:'a@b.com'.repeat(40)},{email:4},{phone_number:'letters'},{phone_number:'1'.repeat(51)},{phone_number:4}])assert.throws(()=>validation.metadata(kind,patch,undefined,true),error=>error.status===400);
});
test('old and new import templates accept blank contacts; supplied contacts are validated',()=>{
    const legacy='project_title,location,owner_name,bp_reference_no,date_applied';
    const row='Annex,Laoag,Applicant,BP-1,2026-11-19';
    const old=transfer.validate('occupancy',legacy+'\n'+row)[0];assert.deepEqual(old.errors,[]);assert.equal(old.data.email,'');
    const full=legacy+',phone_number,email\n'+row;
    assert.deepEqual(transfer.validate('occupancy',full+',09123456789,person@example.com')[0].errors,[]);
    assert.deepEqual(transfer.validate('occupancy',full+',,')[0].errors,[]);
    assert.ok(transfer.validate('occupancy',full+',invalid,invalid')[0].errors.length>=2);
});
test('contact corrections do not change an engineering approval fingerprint',()=>{
    const state={record:{id:1,...fixtures.permits},matrix:[],lots:[],subs:[]};
    const baseline=finalApproval.fingerprint(state);
    assert.equal(finalApproval.fingerprint({...state,record:{...state.record,phone_number:null,email:''}}),baseline);
    assert.equal(finalApproval.fingerprint({...state,record:{...state.record,email:'contact@example.com'}}),baseline);
    assert.notEqual(finalApproval.fingerprint({...state,record:{...state.record,project_title:'Changed project'}}),baseline);
});
test('legacy final approvals remain valid after contact edits, but technical changes still require review',()=>{
    const saved={record:{id:1,...fixtures.permits,email:'old@example.com'},matrix:[{id:1,discipline_name:'Electrical',signature_status:'Approved'}]};
    const latest={id:1,decision:'approved',snapshot_hash:finalApproval.fingerprint(saved,true),snapshot:JSON.stringify(saved)};
    const updated={...saved,record:{...saved.record,phone_number:'09123456789',email:''}};
    assert.equal(finalApproval.summary(updated,[latest]).status,'approved');
    assert.equal(finalApproval.summary({...updated,record:{...updated.record,project_title:'Technical change'}},[latest]).status,'ready');
    assert.equal(finalApproval.summary(updated,[{...latest,snapshot:'{invalid'}]).status,'ready');
    assert.equal(finalApproval.summary(updated,[{...latest,snapshot:{...saved,record:{...saved.record,project_title:'Tampered baseline'}}}]).status,'ready');
    assert.equal(finalApproval.summary(updated,[{...latest,decision:'returned',remarks:'Correction required'}]).status,'returned');
});
test('existing creation retry tokens still replay after blank contact columns are added',async()=>{
    const original=fixtures.permits,originalHash=hash(original);
    const db={query:async sql=>sql.startsWith('SELECT kind')?[[{kind:'permits',content_hash:originalHash,project_id:12}]]:[[{id:12}]]};
    assert.equal(await requests.prior(db,1,'existing','permits',{...original,phone_number:'',email:''}),12);
    await assert.rejects(requests.prior(db,1,'existing','permits',{...original,email:'different@example.com'}),error=>error.status===409);
});
