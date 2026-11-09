const {test}=require('node:test'),assert=require('node:assert/strict');
const reports=require('./monthlyReports'),writer=require('./monthlyReportExport'),ExcelJS=require('exceljs');
const period=()=>reports.filters({month:'2026-10'},'2026-11-04');
const record=(id,kind='permits',filed='2026-10-01')=>({id,kind,project_title:'Project '+id,owner_name:'Owner',location:'Laoag',...(kind==='permits'?{permit_date:filed}:{date_applied:filed})});
const fixture=()=>({current:[record(1),record(2,'occupancy'),record(3,'permits','2026-09-01')],reviews:[],activities:[],archives:[]});
const review=(id,project_id,kind,decision,event_on,filed)=>({id,project_id,kind,decision,event_on,snapshot:{record:record(project_id,kind,filed)}});
test('periods validate inputs, default to the last full month, and truncate the current month in Manila',()=>{
 assert.equal(reports.filters({},'2027-01-04').month,'2026-12');
 assert.equal(reports.filters({month:'2024-02'},'2026-11-04').to,'2024-02-29');
 assert.equal(reports.filters({month:'2026-11'},'2026-11-04').to,'2026-11-04');
 for(const query of [{month:'2026-13'},{month:'2026-12'},{month:'__proto__'},{month:['2026-10']},{kind:'users'},{kind:['permits']},{page:'0'},{page:'1 OR 1=1'}])assert.throws(()=>reports.filters(query,'2026-11-04'),{status:400});
});
test('calendar extraction preserves date-only values, Manila snapshot dates and legacy US rejection dates',()=>{
 assert.equal(reports.day('2026-09-30T16:00:00.000Z'),'2026-10-01');
 assert.equal(reports.day('10/5/2026, 5:12:05 PM'),'2026-10-05');
 assert.equal(reports.day('2026-10-01'),'2026-10-01');
 for(const value of ['2026-02-30','02/30/2026','invalid',null])assert.equal(reports.day(value),null);
});
test('historical decisions count by action month, deduplicate per parent, and use the last saved approval baseline',()=>{
 const data=fixture();data.current[0].permit_date='2026-10-10';
 data.reviews=[review(1,1,'permits','returned','2026-10-03','2026-10-01'),review(2,1,'permits','approved','2026-10-10','2026-10-01'),review(3,1,'permits','approved','2026-10-20','2026-10-01'),review(4,3,'permits','approved','2026-10-02','2026-09-01'),review(5,2,'occupancy','approved','2026-11-01','2026-10-01')];
 data.activities=[{kind:'permits',project_id:1,category:'activity',outcome:'saved',event_on:'2026-10-03',message:'Updated routing matrix',details:{version:1,changes:[{field:'Architectural · Status',before:'Pending',after:'Rejected'}]}}];
 const r=reports.build(data,period());assert.equal(r.summary.filed,2);assert.equal(r.summary.approved,2);assert.equal(r.summary.returned,1);assert.equal(r.summary.average_days,25);assert.equal(r.allRecords.find(r=>r.id===1&&r.kind==='permits').processing_days,19);assert.equal(r.allRecords.find(r=>r.id===1).approval_filed_on,'2026-10-01');
 assert.equal(r.weeks.reduce((sum,w)=>sum+w.total,0),2);assert.equal(data.current[0].aging,undefined);
});
test('pending requests, failed saves and comments do not count as returns; both registries and legacy history remain isolated',()=>{
 const data=fixture(),changes=[{field:'Line and Grade · Status',before:'Pending',after:'Rejected'}];
 data.current[0].rejection_history=JSON.stringify([{timestamp:'10/5/2026, 5:12:05 PM'},{timestamp:'bad'}]);
 data.activities=[['activity','failed','Updated routing matrix'],['comment','saved','Comment'],['activity','saved','Submitted for administrator approval: routing matrix']].map(([category,outcome,message])=>({kind:'occupancy',project_id:2,category,outcome,message,event_on:'2026-10-05',details:{changes}}));
 const r=reports.build(data,period());assert.equal(r.summary.returned,1);assert.equal(r.coverage.invalid_history_dates,1);assert.equal(r.breakdown.find(r=>r.kind==='occupancy').returned,0);
 const filtered=reports.build(data,reports.filters({month:'2026-10',kind:'occupancy'},'2026-11-04'));assert.equal(filtered.summary.filed,1);assert.equal(filtered.summary.returned,0);assert.equal(filtered.breakdown.length,1);
});
test('deleted permits and reviews are recovered from retained snapshots without double counting a live record or pending deletion',()=>{
 const data=fixture(),state={record:record(4),final_reviews:[review(8,4,'permits','approved','2026-10-12','2026-10-01')]};
 data.archives=[{kind:'permits',category:'activity',outcome:'saved',details:{deletion:{mode:'direct',project:state}}},{kind:'permits',category:'bulk_delete',outcome:'approved',details:{type:'bulk_delete',projects:[state,{record:record(1)}]}},{kind:'permits',category:'bulk_delete',outcome:'pending',details:{type:'bulk_delete',projects:[{record:record(99)}]}}];
 data.reviews=[state.final_reviews[0]];const r=reports.build(data,period());assert.equal(r.summary.filed,3);assert.equal(r.summary.approved,1);assert.equal(r.coverage.archived_records,1);assert.equal(r.summary.average_days,11);assert.ok(!r.allRecords.some(p=>p.id===99));
});
test('missing or inconsistent approval dates are excluded from the average, while approval counts remain visible',()=>{
 const data=fixture();data.reviews=[{...review(1,1,'permits','approved','2026-10-12','2026-10-01'),snapshot:null},review(2,2,'occupancy','approved','2026-10-03','2026-10-05')];
 const r=reports.build(data,period());assert.equal(r.summary.approved,2);assert.equal(r.summary.average_days,null);assert.equal(r.summary.missing_processing_dates,2);assert.equal(r.summary.completed_with_dates,0);
});

test('approved operator deletion archives count but unsuccessful deletion attempts cannot add a filing',()=>{
 const data={current:[],reviews:[],activities:[],archives:[{kind:'occupancy',category:'activity',outcome:'saved',details:{deletion:{mode:'approved_request',project:{record:record(7,'occupancy')}}}},{kind:'occupancy',category:'activity',outcome:'failed',details:{deletion:{mode:'approved_request',project:{record:record(8,'occupancy')}}}}]};
 const r=reports.build(data,period());assert.equal(r.summary.filed,1);assert.equal(r.coverage.archived_records,1);
});
test('pagination and empty reports preserve totals and all export records; current-month future events stay out',()=>{
 const data=fixture();data.current=Array.from({length:25},(_,i)=>record(i+1));const r=reports.build(data,{...period(),page:999});assert.equal(r.pagination.page,2);assert.equal(r.records.length,5);assert.equal(r.allRecords.length,25);assert.equal(r.summary.filed,25);
 const empty=reports.build({current:[],reviews:[],activities:[],archives:[]},period());assert.equal(empty.summary.filed,0);assert.equal(empty.summary.average_days,null);assert.equal(empty.pagination.pages,1);
 const current=reports.build({current:[record(1,'permits','2026-11-05')],reviews:[review(1,1,'permits','approved','2026-11-05','2026-11-01')],activities:[],archives:[]},reports.filters({month:'2026-11'},'2026-11-04'));assert.equal(current.allRecords.length,0);
});
test('Excel and CSV export literal text, native numeric dates and every matched record, independently of pagination',async()=>{
 const data=fixture();data.current[0].project_title='=HYPERLINK("bad","text")';data.current[1].project_title=`UAT O'Brien "Annex" \\ Test`;data.reviews=[review(1,1,'permits','approved','2026-10-12','2026-10-01')];const r=reports.build(data,period()),csv=writer.csv(r);
 assert.match(csv,/10\/01\/2026/);assert.match(csv,/'=HYPERLINK/);assert.ok(csv.includes(`O'Brien`));
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await writer.excel(r));assert.deepEqual(workbook.worksheets.map(s=>s.name),['Summary','Building','Occupancy']);const row=workbook.getWorksheet('Building').getRow(2);assert.equal(row.getCell(4).value,data.current[0].project_title);assert.ok(row.getCell(7).value instanceof Date);assert.equal(row.getCell(7).numFmt,'mm/dd/yyyy');assert.equal(row.getCell(10).value,11);assert.equal(workbook.getWorksheet('Occupancy').rowCount,2);
});
