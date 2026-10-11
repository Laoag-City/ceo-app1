const test = require('node:test');
const assert = require('node:assert/strict');
const {reportFilters,aggregateReport,createQueueReports,registerQueueReports,recordTicketTransition} = require('./queue-reports');
const {createPermitSessions} = require('../monitorBP backend/permitSessions');
const {convert,bind} = require('../database/postgres-sql');

test('report dates are inclusive Manila arrival days and invalid filters do not query', async () => {
    const now = new Date('2026-10-07T16:01:00Z');
    assert.deepEqual(reportFilters({},now), {from:'2026-10-08',to:'2026-10-08',window:'',service:''});
    let queried = false;
    const report = createQueueReports({query:async () => {queried=true;return [[]];}}, {now:()=>now});
    for (const query of [{from:'2026-02-30'},{from:['2026-10-08']},{from:'2026-10-09',to:'2026-10-08'},
        {from:'2025-01-01',to:'2026-10-08'},{window:'PC4'},{service:"Inquire' OR 1=1"},{window:['PC1']}]) {
        await assert.rejects(report(query),error=>error.status===400);
    }
    assert.equal(queried,false);
});

test('cohort reports retain repeated ticket numbers and do not invent legacy timing', () => {
    const filters = reportFilters({from:'2026-10-07',to:'2026-10-08'});
    const report = aggregateReport([
        {id:1001,report_visit_id:'old-visit',reason:'Releasing Bldg. Permit',status:'completed',created_at:'2026-10-07T15:59:00Z',report_tracking_started:0,first_called_at:null,service_ms:0,name:'Never include this'},
        {id:1001,report_visit_id:'new-visit',reason:'Releasing Bldg. Permit',status:'completed',created_at:'2026-10-07T16:00:00Z',report_tracking_started:1,first_called_at:'2026-10-07T16:01:00Z',completed_at:'2026-10-07T16:16:00Z',service_ms:240000},
        {reason:'Releasing Bldg. Occupancy',status:'waiting',created_at:'2026-10-08T04:00:00Z',report_tracking_started:1},
        {reason:'Inquire',status:'dropped',created_at:'2026-10-08T05:00:00Z',report_tracking_started:1}
    ],filters);
    assert.equal(report.summary.registered,4);
    assert.equal(report.summary.completed,2);
    assert.equal(report.summary.dropped,1);
    assert.equal(report.summary.waiting,1);
    assert.equal(report.summary.averageWaitSeconds,60);
    assert.equal(report.summary.averageServiceSeconds,240);
    assert.deepEqual(report.timingCoverage,{measured:1,total:4,waitMeasured:1,serviceMeasured:1});
    assert.equal(report.daily[0].registered,1);
    assert.equal(report.daily[0].averageWaitSeconds,null);
    assert.equal(report.daily[1].registered,3);
    assert.equal(report.windows[0].registered,2);
    assert.equal(report.windows[1].averageServiceSeconds,null);
    assert.ok(!JSON.stringify(report).includes('Never include this'));
});

test('window/service filters use bound values on either engine and empty cohorts show unavailable averages', async () => {
    const calls=[];
    const read = createQueueReports({query:async(sql,args)=>{calls.push({sql,args});return [[]];}});
    const response = await read({from:'2026-10-08',to:'2026-10-08',window:'PC3',service:'Inquire'});
    assert.equal(response.summary.registered,0);
    assert.equal(response.summary.averageWaitSeconds,null);
    assert.equal(response.summary.averageServiceSeconds,null);
    assert.deepEqual(calls[0].args,[new Date('2026-10-07T16:00:00Z'),new Date('2026-10-08T16:00:00Z'),['Receiving Bldg. Permit','Receiving Bldg. Occupancy','Inquire'],'Inquire']);
    assert.ok(!calls[0].sql.includes('phone'));
    const compiled=bind(convert(calls[0].sql,calls[0].args).sql,calls[0].args);
    assert.match(compiled.sql,/reason IN \(\$3,\$4,\$5\)/);
    assert.equal(compiled.args[5],'Inquire');
});

test('an immediate measured call tolerates database timestamp rounding and remains distinct from unknown history', () => {
    const response=aggregateReport([
        {reason:'Inquire',status:'completed',created_at:'2026-10-08T00:00:00.501Z',first_called_at:'2026-10-08T00:00:00.500Z',completed_at:'2026-10-08T00:00:00.500Z',report_tracking_started:1,service_ms:0},
        {reason:'Inquire',status:'completed',created_at:'2026-10-08T00:00:00Z',report_tracking_started:0,service_ms:0}
    ],reportFilters({from:'2026-10-08',to:'2026-10-08'}));
    assert.equal(response.summary.averageWaitSeconds,0);
    assert.equal(response.summary.averageServiceSeconds,0);
    assert.equal(response.timingCoverage.waitMeasured,1);
    assert.equal(response.timingCoverage.serviceMeasured,1);
});

test('service segments exclude held time and preserve the first call when resumed', async () => {
    let row={id:1,status:'waiting',report_visit_id:'same-visit',report_tracking_started:1,service_ms:0};
    const conn={query:async(sql,args)=>{
        const [visit,first,completed,dropped,started,ms]=args;
        row={...row,report_visit_id:visit,first_called_at:first,completed_at:completed,dropped_at:dropped,service_started_at:started,service_ms:ms};
    }};
    await recordTicketTransition(conn,row,'serving',new Date('2026-10-08T02:01:00Z'));
    row.status='serving';
    await recordTicketTransition(conn,row,'holding',new Date('2026-10-08T02:02:00Z'));
    row.status='holding';
    await recordTicketTransition(conn,row,'serving',new Date('2026-10-08T02:12:00Z'));
    row.status='serving';
    await recordTicketTransition(conn,row,'completed',new Date('2026-10-08T02:15:00Z'));
    assert.equal(row.report_visit_id,'same-visit');
    assert.equal(row.first_called_at.toISOString(),'2026-10-08T02:01:00.000Z');
    assert.equal(row.service_ms,240000);
    assert.equal(row.service_started_at,null);
    assert.equal(row.completed_at.toISOString(),'2026-10-08T02:15:00.000Z');
});

test('reports require a current staff session, return no-store, and conceal database failure detail', async () => {
    let handlers;
    let failed=false,reads=0;
    registerQueueReports({get:(url,...route)=>{assert.equal(url,'/api/reports');handlers=route;}}, {query:async()=>{reads++;if(failed)throw Error('private database credential');return [[]];}},createPermitSessions({}));
    async function invoke(user) {
        let result,pending;
        const req={user,query:{},get:()=>undefined};
        const res={statusCode:200,headers:{},set(key,value){this.headers[key]=value;return this;},status(status){this.statusCode=status;return this;},json(body){result={status:this.statusCode,headers:this.headers,body};return this;}};
        handlers[0](req,res,()=>{pending=handlers[1](req,res);});
        await pending;
        return result;
    }
    assert.equal((await invoke(null)).status,401);
    assert.equal((await invoke({id:1,role:'visitor'})).status,403);
    assert.equal(reads,0);
    for (const role of ['operator','admin','superadmin']) assert.equal((await invoke({id:1,role})).headers['Cache-Control'],'no-store');
    failed=true;
    const response=await invoke({id:1,role:'operator'});
    assert.equal(response.status,503);
    assert.equal(response.body.message,'Queue reports are unavailable. Please try again.');
    assert.ok(!JSON.stringify(response).includes('credential'));
});
