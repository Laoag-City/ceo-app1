import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const source = readFileSync(new URL('../features/queue/service-desk.html', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8');
const tasks={PC1:['Receiving Bldg. Permit','Receiving Bldg. Occupancy','Inquire'],PC2:['Releasing Bldg. Occupancy'],PC3:['Releasing Bldg. Permit']};
const ticket=(id,workspace='PC1',name='Client '+id)=>({id:'TKT-'+id,name,reason:tasks[workspace][0],calledBy:workspace});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

// Mount the real React layout and run its actual controller, including row clicks.
async function queueFixture(workspace='PC1') {
    const dom=new JSDOM('<div id="system-react-root" data-page="queue-kiosk"></div>',{url:'http://localhost/kiosk.html',runScripts:'outside-only'});
    const w=dom.window,handlers={},calls=[],confirmations=[],details=[];
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.ResizeObserver=class{observe(){}disconnect(){}};
    w.eval(bundle);await settle();
    let respond=async()=>({success:false,message:'Test response not set'});
    Object.assign(w,{currentWorkspace:workspace,workspaceTasks:tasks,BACKEND_URL:'http://localhost:5000',socket:{on:(event,fn)=>handlers[event]=fn},
        RequestFeedback:{fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {json:()=>respond(calls.at(-1))};}},
        DestructiveAction:{run:options=>confirmations.push(options)},openDetailsModal:id=>details.push(id)});
    const state=source.slice(source.indexOf('    let localTicketRegistry ='),source.indexOf('    const detailsModal ='));
    const lists=source.slice(source.indexOf('    const visibleTicketNames ='),source.indexOf('    let ticketSubmission ='));
    const actions=source.slice(source.indexOf('    async function serviceAction'),source.indexOf("    document.getElementById('resetBtn')",source.indexOf('    async function serviceAction')));
    w.eval(state+lists+actions);
    return {dom,w,d:w.document,handlers,calls,confirmations,details,respond:fn=>{respond=fn;},node:id=>w.document.getElementById(id)};
}

test('each window filters all lists, reconnects, and can finish its last client',async()=>{
    for(const workspace of Object.keys(tasks)) {
        const f=await queueFixture(workspace);
        try {
            assert.equal(f.node('callNextBtn').disabled,true);
            f.handlers.queueUpdate({queue:[],onHold:[],serving:[]});
            assert.equal(f.node('callNextBtn').disabled,true,'Empty window must not call a nonexistent client');
            assert.equal(f.node('dropBtn').disabled,true);
            const own=ticket(1,workspace),other=ticket(2,workspace==='PC1'?'PC2':'PC1');
            f.handlers.queueUpdate({queue:[own,other],onHold:[own,other],finished:[own,other],serving:[other]});
            for(const id of ['waitingCount','heldCount','finishedCount'])assert.equal(f.node(id).textContent,'1');
            assert.equal(f.node('callNextBtn').disabled,false);
            assert.equal(f.node('holdBtn').disabled,true);
            assert.equal(f.d.querySelector('#clerkFinishedList .desk-row-drop'),null);
            assert.equal(f.d.querySelector('#clerkFinishedList .desk-ticket-select'),null);
            f.handlers.queueUpdate({queue:[],serving:[other,own]});
            assert.equal(f.node('activeTicketLabel').textContent,own.id);
            assert.equal(f.node('activeTicketName').textContent,own.name);
            assert.equal(f.node('callNextBtn').disabled,false,'Next can finish the final current client');
            assert.equal(f.node('holdBtn').disabled,false);
            f.handlers.disconnect();
            assert.equal(f.node('holdBtn').disabled,true);
            assert.match(f.d.querySelector('.desk-live').textContent,/Connecting/);
            f.handlers.queueUpdate({nowServing:own});
            assert.equal(f.node('holdBtn').disabled,false);
            assert.equal(f.node('activeTicketStatus').textContent,'In service');
        }finally{f.dom.window.close();}
    }
});

test('registration issues service-only tickets without any applicant fields', async () => {
    const f = await queueFixture('Kiosk');
    try {
        f.w.FormSafety = {guard: (_formId, submit) => submit};
        f.w.eval('let popupTimeout;\n' + source.slice(source.indexOf('    let ticketSubmission ='), source.indexOf('    // Disable all service actions')));
        for(const id of ['applicantName','applicantPhone','agentName','barangayHiddenValue','bldgLocationHiddenValue'])assert.equal(f.node(id),null);
        const reasons=Object.values(tasks).flat();
        for(const [index,reason] of reasons.entries()){
            const ticketId='TKT-'+(index+1);
            f.respond(async()=>({success:true,ticketId}));
            f.d.querySelector('input[name="visitReason"][value="'+reason+'"]').checked=true;
            f.node('queueForm').requestSubmit();await settle();
            assert.equal(f.calls.length,index+1);
            assert.equal(f.calls[index].body.reason,reason);
            assert.deepEqual(Object.keys(f.calls[index].body).sort(),['reason','requestId']);
            assert.equal(f.node('ticketId').innerText,ticketId);
        }
    }finally{f.dom.window.close();}
});

test('the original window retains an existing active ticket and its finished history after services change',async()=>{
    const f=await queueFixture('PC1');
    try {
        const legacy={...ticket(1,'PC1'),reason:'Releasing Bldg. Permit'};
        const waiting={...ticket(2,'PC3'),calledBy:null};
        f.handlers.queueUpdate({serving:[legacy],queue:[waiting],finished:[legacy]});
        assert.equal(f.node('activeTicketLabel').textContent,'TKT-1');
        assert.equal(f.node('dropBtn').disabled,false);
        assert.equal(f.node('finishedCount').textContent,'1');
        assert.equal(f.node('waitingCount').textContent,'0');
        assert.match(f.node('clerkFinishedList').textContent,/TKT-1/);
    }finally{f.dom.window.close();}
});

test('Next finishes current, calls next, reports success, and blocks double clicks',async()=>{
    const f=await queueFixture();
    try {
        const own=ticket(1),next=ticket(2);f.handlers.queueUpdate({serving:[own],queue:[next]});
        let resolveResponse;f.respond(()=>new Promise(resolve=>{resolveResponse=resolve;}));
        const request=f.w.eval("serviceAction('next')");
        assert.equal(f.node('callNextBtn').disabled,true);
        assert.equal(f.node('holdBtn').disabled,true);
        assert.equal(await f.w.eval("serviceAction('next')"),false);
        assert.equal(f.calls.length,1);
        assert.deepEqual(f.calls[0].body,{workspace:'PC1',ticketId:'TKT-1'});
        await settle();resolveResponse({success:true,ticket:next,completedTicket:own});
        assert.equal(await request,true);
        f.handlers.queueUpdate({serving:[next],finished:[own]});
        assert.equal(f.node('activeTicketLabel').textContent,'TKT-2');
        assert.match(f.node('queueActionFeedback').textContent,/TKT-1 moved to Finished.*TKT-2 called/);
        assert.equal(f.node('finishedCount').textContent,'1');
        f.respond(async()=>({success:true,ticket:null,completedTicket:next}));
        assert.equal(await f.w.eval("serviceAction('next')"),true);
        f.handlers.queueUpdate({finished:[own,next]});
        assert.equal(f.node('callNextBtn').disabled,true);
        assert.match(f.node('queueActionFeedback').textContent,/all caught up/);
    }finally{f.dom.window.close();}
});

test('held row resumes the chosen ticket, preserving the tab across updates and rendering names safely',async()=>{
    const f=await queueFixture('PC3');
    try {
        const own=ticket(4,'PC3'),first=ticket(5,'PC3'),chosen=ticket(6,'PC3','<img src=x onerror=alert(1)>');
        f.handlers.queueUpdate({serving:[own],onHold:[first,chosen]});
        f.node('heldTab').click();
        f.respond(async()=>({success:true,ticket:chosen,completedTicket:own}));
        f.node('clerkHoldList').querySelectorAll('.desk-ticket-select')[1].click();await settle();
        assert.equal(f.calls[0].url,'http://localhost:5000/api/tickets/resume');
        assert.deepEqual(f.calls[0].body,{workspace:'PC3',ticketId:'TKT-6',currentTicketId:'TKT-4'});
        assert.equal(f.node('activeTicketName').textContent,chosen.name);
        assert.equal(f.node('clerkHoldList').querySelector('img'),null);
        f.handlers.queueUpdate({serving:[chosen],onHold:[first],finished:[own]});
        assert.equal(f.node('heldPanel').hidden,false);
        assert.equal(f.node('heldTab').getAttribute('aria-selected'),'true');
        f.node('heldTab').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        assert.equal(f.node('finishedPanel').hidden,false);
        assert.equal(f.d.activeElement,f.node('finishedTab'));
        f.node('clerkFinishedList').querySelector('button').click();
        assert.deepEqual(f.details,['TKT-4']);
    }finally{f.dom.window.close();}
});

test('Hold releases current; Drop needs confirmation and does not replace another current client',async()=>{
    const f=await queueFixture();
    try {
        const own=ticket(1),held=ticket(2);f.handlers.queueUpdate({serving:[own],onHold:[held]});
        f.respond(async()=>({success:true,ticket:own}));
        assert.equal(await f.w.eval("serviceAction('hold')"),true);
        assert.equal(f.node('holdBtn').disabled,true);
        assert.match(f.node('queueActionFeedback').textContent,/on hold/);
        f.handlers.queueUpdate({serving:[own],onHold:[held]});
        f.node('heldTab').click();f.d.querySelector('#clerkHoldList .desk-row-drop').click();
        assert.equal(f.calls.length,1,'Opening/canceling a confirmation must not send a mutation');
        assert.match(f.confirmations[0].message,/TKT-2/);
        f.respond(async()=>({success:true,ticket:held}));await f.confirmations[0].action();
        assert.deepEqual(f.calls.at(-1).body,{workspace:'PC1',ticketId:'TKT-2',expectedStatus:'holding'});
        assert.equal(f.node('activeTicketLabel').textContent,'TKT-1');
        f.node('dropBtn').click();f.respond(async()=>({success:true,ticket:own}));await f.confirmations[1].action();
        assert.equal(f.calls.at(-1).body.expectedStatus,'serving');
        assert.equal(f.node('holdBtn').disabled,true);
    }finally{f.dom.window.close();}
});

test('Window 2 Hold preserves Window 1’s waiting list and Next button across the same broadcast',async()=>{
    const one=await queueFixture('PC1'),two=await queueFixture('PC2');
    try {
        const waiting=ticket(1001,'PC1'),active=ticket(1002,'PC2');
        const before={queue:[waiting],onHold:[],serving:[active],finished:[]};
        for(const f of [one,two])f.handlers.queueUpdate(before);
        assert.equal(one.node('waitingCount').textContent,'1');
        assert.match(one.node('clerkQueueList').textContent,/TKT-1001/);
        const after={queue:[waiting],onHold:[{...active,calledBy:null}],serving:[],finished:[]};
        two.respond(async()=>{
            for(const f of [one,two])f.handlers.queueUpdate(after);
            return {success:true,ticket:after.onHold[0]};
        });
        two.node('holdBtn').click();await settle();
        assert.equal(two.calls.length,1);
        assert.deepEqual(two.calls[0].body,{workspace:'PC2',ticketId:'TKT-1002'});
        assert.equal(one.calls.length,0);
        assert.equal(one.node('waitingCount').textContent,'1');
        assert.match(one.node('clerkQueueList').textContent,/TKT-1001/);
        assert.equal(one.node('callNextBtn').disabled,false);
        assert.equal(one.node('heldCount').textContent,'0');
        assert.equal(two.node('heldCount').textContent,'1');
        assert.equal(two.node('activeTicketLabel').textContent,'Ready for a client');
    }finally{one.dom.window.close();two.dom.window.close();}
});

test('failed actions preserve current and restore controls; disconnected clicks send nothing',async()=>{
    const f=await queueFixture();
    try {
        const own=ticket(1);f.handlers.queueUpdate({serving:[own]});
        f.respond(async()=>({success:false,message:'Your current ticket changed. Refresh and try again.'}));
        assert.equal(await f.w.eval("serviceAction('next')"),false);
        assert.equal(f.node('activeTicketLabel').textContent,own.id);
        assert.equal(f.node('queueActionFeedback').dataset.error,'true');
        assert.equal(f.node('callNextBtn').disabled,false);
        f.respond(async()=>{throw Error('Connection failed');});
        assert.equal(await f.w.eval("serviceAction('next')"),false);
        assert.equal(f.node('queueActionFeedback').textContent,'Connection failed');
        f.handlers.disconnect();assert.equal(await f.w.resumeTicket('TKT-2'),false);
        assert.equal(f.calls.length,2);
    }finally{f.dom.window.close();}
});

function workstationNavigationFixture(workspace, {canLeave = true, failure} = {}) {
    const source = readFileSync(new URL('../features/queue/service-desk.html', import.meta.url), 'utf8');
    const start = source.indexOf('    async function handleWorkstationBack()');
    const end = source.indexOf('    // Refresh must not release', start);
    const listeners = {};
    const nodes = Object.fromEntries(['logoutBtn', 'kioskLogoutBtn', 'queueActionFeedback'].map(id => [id, {
        disabled: false, textContent: '', addEventListener: (_, handler) => {listeners[id] = handler;}
    }]));
    const storage = new Map([['currentWorkspace', workspace], ['otherPreference', 'keep']]);
    const calls = [];
    const location = {href: 'kiosk.html'};
    vm.runInNewContext(source.slice(start, end), {
        document: {getElementById: id => nodes[id]},
        FormSafety: {leave: () => canLeave},
        RequestFeedback: {fetch: async (url, options) => {
            calls.push({url, options});
            if (failure) throw new Error(failure);
            return {ok: true};
        }},
        BACKEND_URL: 'http://localhost:5000', currentWorkspace: workspace,
        sessionStorage: {removeItem: key => storage.delete(key)}, window: {location}
    });
    return {listeners, nodes, storage, calls, location};
}

test('returning from each service window releases its assignment and keeps the account signed in', async () => {
    for (const workspace of ['PC1', 'PC2', 'PC3']) {
        const fixture = workstationNavigationFixture(workspace);
        await fixture.listeners.logoutBtn();
        assert.equal(fixture.calls.length, 1, 'Account logout must not be requested');
        assert.equal(fixture.calls[0].url, 'http://localhost:5000/api/workstations/logout');
        assert.equal(fixture.calls[0].options.method, 'POST');
        assert.equal(JSON.parse(fixture.calls[0].options.body).workspace, workspace);
        assert.equal(fixture.storage.has('currentWorkspace'), false);
        assert.equal(fixture.storage.get('otherPreference'), 'keep');
        assert.equal(fixture.location.href, 'workstations.html');
    }
});

test('failed window release preserves the selected window and reports the error', async () => {
    const fixture = workstationNavigationFixture('PC2', {failure: 'Could not reach the server'});
    await fixture.listeners.logoutBtn();
    assert.equal(fixture.storage.get('currentWorkspace'), 'PC2');
    assert.equal(fixture.location.href, 'kiosk.html');
    assert.equal(fixture.nodes.queueActionFeedback.textContent, 'Could not reach the server');
    assert.equal(fixture.nodes.logoutBtn.disabled, false);
});

test('canceling the unsaved-change prompt keeps the service window open', async () => {
    const fixture = workstationNavigationFixture('PC3', {canLeave: false});
    await fixture.listeners.logoutBtn();
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.storage.get('currentWorkspace'), 'PC3');
    assert.equal(fixture.location.href, 'kiosk.html');
});

test('kiosk back returns to station selection without signing out and respects unsaved work', () => {
    const fixture = workstationNavigationFixture('Kiosk');
    fixture.listeners.kioskLogoutBtn();
    assert.equal(fixture.location.href, 'workstations.html');
    assert.equal(fixture.storage.has('currentWorkspace'), false);
    assert.equal(fixture.storage.get('otherPreference'), 'keep');
    assert.equal(fixture.calls.length, 0);

    const canceled = workstationNavigationFixture('Kiosk', {canLeave: false});
    canceled.listeners.kioskLogoutBtn();
    assert.equal(canceled.location.href, 'kiosk.html');
    assert.equal(canceled.storage.get('currentWorkspace'), 'Kiosk');
});
