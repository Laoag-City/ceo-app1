const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {historySearch, createClientHistory, registerClientHistory, resetQueueWithHistory} = require('./client-history');
const {createPermitSessions} = require('../monitorBP backend/permitSessions');
const {convert, bind} = require('../database/postgres-sql');

test('client history search binds ticket, name, phone and address with literal wildcard matching on both engines', () => {
    for (const dialect of ['postgres', 'mysql']) {
        const term = " TKT-1001 %_! O'Brien ? ";
        const search = historySearch({q:term,page:'2',pageSize:'25'}, dialect);
        assert.deepEqual(search.args, Array(4).fill("%TKT-1001 !%!_!! O'Brien ?%"));
        assert.equal(search.page, 2);
        assert.equal(search.pageSize, 25);
        assert.ok(!search.from.includes("O'Brien"));
        for (const field of ['name','phone','barangay']) assert.ok(search.from.includes(`COALESCE(${field},'')`));
        assert.ok(search.from.includes("CONCAT('TKT-',CAST(id AS"));
        assert.ok(search.from.includes('UNION ALL SELECT ticket_id AS id'));
        if (dialect === 'postgres') {
            const compiled = bind(convert('SELECT COUNT(*) AS total' + search.from, search.args).sql, search.args);
            assert.deepEqual(compiled.args, search.args);
            assert.equal((compiled.sql.match(/LIKE LOWER\(\$\d COLLATE public\.app_ci\) COLLATE "C"/g) || []).length, 4);
            assert.ok(!compiled.sql.includes('ILIKE'));
        }
    }
});

test('invalid or oversized history parameters fail before any database query', async () => {
    let queried = false;
    const history = createClientHistory({dialect:'postgres',query:async () => { queried = true; }});
    for (const query of [{q:['name']},{q:'x'.repeat(201)},{page:'0'},{page:'2 OR 1=1'},{pageSize:'101'},{pageSize:'-1'},{page:'9007199254740993'}]) {
        await assert.rejects(history(query), error => error.status === 400);
    }
    assert.equal(queried, false);
});

test('pagination clamps removed pages and uses distinct visit identities for reused ticket numbers', async () => {
    const calls = [];
    const created = new Date('2026-10-05T03:00:00Z');
    const history = createClientHistory({dialect:'postgres',query:async (sql,args) => {
        calls.push({sql,args});
        if (sql.startsWith('SELECT COUNT')) return [[{total:'21'}]];
        return [[
            {id:1001,archive_id:0,name:'Current',phone:'09123456789',barangay:'Address: Laoag',reason:'Inquire',status:'completed',created_at:created,called_by:'PC3'},
            {id:1001,archive_id:8,name:'Previous',phone:null,barangay:'Address: San Nicolas',reason:'Releasing Bldg. Permit',status:'dropped',created_at:'2026-10-04T03:00:00Z',called_by:null}
        ]];
    }});
    const response = await history({page:'99',pageSize:'20'});
    assert.deepEqual(response.pagination, {page:2,pageSize:20,total:21,totalPages:2});
    assert.deepEqual(calls[1].args, [20,20]);
    assert.match(calls[1].sql, /ORDER BY created_at DESC,id DESC,archive_id DESC/);
    assert.deepEqual(response.rows.map(row => row.ticketId), ['TKT-1001','TKT-1001']);
    assert.deepEqual(response.rows.map(row => row.historyId), ['ticket-1001','archive-8']);
    assert.equal(response.rows[0].created_at, created.toISOString());
    assert.equal(response.rows[1].status, 'dropped');
    assert.equal(response.rows[1].phone, null);
    assert.ok(!calls[1].sql.includes("WHERE status = 'waiting'"));
});

test('an empty history remains on page one with no pages or rows', async () => {
    const history = createClientHistory({dialect:'mysql',query:async sql => sql.startsWith('SELECT COUNT') ? [[{total:0}]] : [[]]});
    assert.deepEqual(await history({page:'2'}), {success:true,rows:[],pagination:{page:1,pageSize:20,total:0,totalPages:0}});
});

function routeFixture(db) {
    let route;
    const app = {get:(url,...handlers) => { assert.equal(url,'/api/client-history'); route = handlers; }};
    const sessions = createPermitSessions({});
    registerClientHistory(app, db, sessions);
    return async (user, query = {}, headers = {}) => {
        let result;
        const req = {user,query,get:name => headers[name]};
        const res = {statusCode:200,headers:{},set(name,value) {this.headers[name]=value;return this;},status(code) {this.statusCode=code;return this;},json(body) {result={status:this.statusCode,headers:this.headers,body};return this;}};
        let pending;
        route[0](req,res,() => { pending = route[1](req,res); });
        await pending;
        return result;
    };
}

test('anonymous, unapproved and stale account requests cannot read client details', async () => {
    let reads = 0;
    const invoke = routeFixture({dialect:'postgres',query:async sql => {
        reads++;
        return sql.startsWith('SELECT COUNT') ? [[{total:0}]] : [[]];
    }});
    assert.equal((await invoke(null,{}, {'x-user-role':'superadmin','x-user-id':'1'})).status, 401);
    assert.equal((await invoke({id:1,role:'visitor'})).status, 403);
    assert.equal((await invoke({id:1,role:'operator'}, {}, {'x-user-id':'2'})).status, 409);
    assert.equal(reads, 0);
    for (const role of ['operator','admin','superadmin']) {
        const response = await invoke({id:1,role});
        assert.equal(response.status, 200);
        assert.equal(response.headers['Cache-Control'], 'no-store');
    }
});

test('history route returns useful validation errors and does not disclose database details', async () => {
    const invoke = routeFixture({dialect:'postgres',query:async () => {throw Object.assign(new Error('confidential connection detail'),{code:'42P01'});}});
    assert.equal((await invoke({id:1,role:'operator'},{q:'x'.repeat(201)})).status, 400);
    const response = await invoke({id:1,role:'operator'});
    assert.equal(response.status, 503);
    assert.equal(response.body.message, 'Client history is unavailable. Please try again.');
    assert.ok(!JSON.stringify(response).includes('confidential'));
});

function resetFixture(failArchive = false, failNumbering = false) {
    const initial = [{id:1001,status:'completed'},{id:1002,status:'holding'},{id:1003,status:'dropped'}];
    let tickets = [...initial], archived = [], working, committed = false;
    const calls = [];
    const conn = {
        async query(sql) {
            calls.push(sql);
            if (sql.includes('GET_LOCK')) return [[{acquired:1}]];
            if (sql.startsWith('SELECT id')) return [working.tickets];
            if (sql.startsWith('INSERT INTO queue_client_history_archive')) {
                if (failArchive) throw new Error('Archive unavailable');
                working.archived.push(...working.tickets.map(ticket => ({...ticket})));
            }
            if (sql.startsWith('ALTER TABLE') && failNumbering) throw new Error('Numbering unavailable');
            if (sql === 'DELETE FROM tickets') working.tickets = [];
            return [{affectedRows:1}];
        },
        async beginTransaction() {working = {tickets:[...tickets],archived:[...archived]};},
        async commit() {tickets=working.tickets;archived=working.archived;committed=true;},
        async rollback() {working = null;},
        release() {calls.push('released');}
    };
    return {db:{dialect:'mysql',getConnection:async () => conn},calls,state:() => ({tickets,archived,committed})};
}

test('reset retains every previous client before clearing the active queue; archive failure rolls back', async () => {
    const success = resetFixture();
    await resetQueueWithHistory(success.db);
    assert.deepEqual(success.state().tickets, []);
    assert.deepEqual(success.state().archived.map(row => row.status), ['completed','holding','dropped']);
    assert.equal(success.state().committed, true);
    assert.ok(success.calls.includes('UPDATE ticket_submission_keys SET ticket_id=NULL'));
    assert.ok(success.calls.indexOf('DELETE FROM tickets') > success.calls.findIndex(sql => sql.startsWith('INSERT INTO queue_client_history_archive')));
    assert.equal(success.calls.at(-1), 'released');
    const failure = resetFixture(true);
    await assert.rejects(resetQueueWithHistory(failure.db), /Archive unavailable/);
    assert.equal(failure.state().tickets.length, 3);
    assert.equal(failure.state().archived.length, 0);
    assert.equal(failure.state().committed, false);
    assert.ok(!failure.calls.includes('DELETE FROM tickets'));
    assert.equal(failure.calls.at(-1), 'released');
});

test('MySQL numbering failure after commit still reports a successful queue reset with history retained', async () => {
    const fixture = resetFixture(false, true);
    assert.deepEqual(await resetQueueWithHistory(fixture.db), {numberingReset:false});
    assert.deepEqual(fixture.state().tickets, []);
    assert.equal(fixture.state().archived.length, 3);
    assert.equal(fixture.state().committed, true);
    assert.equal(fixture.calls.at(-1), 'released');
});

test('PostgreSQL reset uses the owner function whose locked transaction archives before deletion', async () => {
    const calls = [];
    await resetQueueWithHistory({dialect:'postgres',query:async sql => {calls.push(sql);}});
    assert.deepEqual(calls, ['SELECT public.reset_office_queue()']);
    const sql = readFileSync(path.join(__dirname,'../migration/queue-runtime.sql'),'utf8');
    const archive = sql.indexOf(' INSERT INTO public.queue_client_history_archive');
    assert.ok(sql.indexOf(' LOCK TABLE') < archive);
    assert.ok(archive < sql.indexOf(' DELETE FROM public.tickets'));
    assert.match(sql, /GRANT SELECT ON public\.queue_client_history_archive TO queue_app_migration/);
    assert.match(sql, /SECURITY DEFINER SET search_path=pg_catalog/);
    assert.match(sql, /UPDATE public\.ticket_submission_keys SET ticket_id=NULL/);
    const server = readFileSync(path.join(__dirname,'queueServer.js'),'utf8');
    assert.ok(server.indexOf("app.get('/client-history.html'") < server.indexOf('// Serve frontend static'));
    assert.ok(server.includes('registerClientHistory(app, db, sessions)'));
});
