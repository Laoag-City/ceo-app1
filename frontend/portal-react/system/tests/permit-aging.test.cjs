const {test}=require('node:test'),assert=require('node:assert/strict');
const aging=require('../assets/permits/permit-aging'),filters=require('../assets/permits/registry-filters');
test('aging cells show safe consistent badges, elapsed days and an explicit historical fallback',()=>{
    const cell=aging.cell({status:'overdue',age_days:64,inactive_days:30,basis:'filing',followup_days:14,overdue_days:30});
    assert.match(cell,/permit-aging-overdue/);assert.match(cell,/64 days since filing/);assert.match(cell,/30 days without activity/);assert.match(cell,/No activity log; using filing date/);
    assert.match(aging.cell({status:'normal',age_days:0,inactive_days:0,basis:'activity'}),/Filed today/);
    assert.match(aging.cell({status:'normal',age_days:1,inactive_days:1,basis:'activity'}),/1 day since filing/);
    assert.match(aging.cell({status:'completed',age_days:64}),/Follow-up clock stopped/);
    assert.doesNotMatch(aging.cell({status:'<img src=x onerror=alert(1)>',age_days:'<script>',inactive_days:-1,followup_days:'" onmouseover="bad'}),/<img|<script|onmouseover/);
    assert.match(aging.cell(null),/Check dates/);
});
test('aging filters combine with search/status/date and sorting keeps unmeasurable rows last',()=>{
    const records=[
        {id:1,project_title:'Office A',permit_date:'2026-09-01',status:'pending',aging:{status:'followup',inactive_days:14}},
        {id:2,project_title:'Office B',permit_date:'2026-10-01',status:'pending',aging:{status:'overdue',inactive_days:30}},
        {id:3,project_title:'Office C',permit_date:'2026-09-01',status:'approved',aging:{status:'completed',inactive_days:null}},
        {id:4,project_title:'Office D',status:'pending',aging:{status:'unknown',inactive_days:null}},
        {id:5,project_title:'Office E',permit_date:'2026-11-04',status:'pending',aging:{status:'normal',inactive_days:0}}
    ];
    const select=state=>filters.select(records,{query:'',status:'all',aging:'all',sort:'id-newest',...state},'building',p=>p.status).map(p=>p.id);
    assert.deepEqual(select({aging:'attention'}),[2,1]);assert.deepEqual(select({aging:'overdue'}),[2]);assert.deepEqual(select({aging:'unknown'}),[4]);
    assert.deepEqual(select({aging:'attention',query:'office',from:'2026-10-01'}),[2]);assert.deepEqual(select({aging:'attention',status:'approved'}),[]);
    assert.deepEqual(select({sort:'inactive-desc'}),[2,1,5,4,3]);assert.deepEqual(records.map(p=>p.id),[1,2,3,4,5]);
    assert.equal(filters.cleanState({aging:'invented'},['all']).aging,'all');
});
