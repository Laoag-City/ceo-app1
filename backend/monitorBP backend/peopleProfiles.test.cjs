const {test}=require('node:test');
const assert=require('node:assert/strict');
const mysql=require('mysql2/promise');
const express=require('express');
const bcrypt=require('bcryptjs');
const {createPermitSessions}=require('./permitSessions');
const createPeople=require('./peopleProfiles');

test('People and profiles: real HTTP/session rules against temporary tables only',async t=>{
    const conn=await mysql.createConnection({host:'localhost',user:'root',database:'permit_system'});
    let server;
    try {
        // Connection-local shadows prevent all tests (including password updates) touching real accounts.
        await conn.query('CREATE TEMPORARY TABLE users (id INT PRIMARY KEY,username VARCHAR(50),password VARCHAR(255),role VARCHAR(20),is_verified INT,is_active INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await conn.query('CREATE TEMPORARY TABLE permit_station_assignments (user_id INT,station_key VARCHAR(120),station_name VARCHAR(100),PRIMARY KEY(user_id,station_key))');
        await conn.query('CREATE TEMPORARY TABLE permit_sessions (token_hash CHAR(64) PRIMARY KEY,user_id INT,expires_at DATETIME(3),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await conn.query('CREATE TEMPORARY TABLE permit_session_replacements (token_hash CHAR(64) PRIMARY KEY,expires_at DATETIME(3))');
        for(const sql of createPeople.schema)await conn.query(sql.replace('CREATE TABLE IF NOT EXISTS','CREATE TEMPORARY TABLE'));
        const fixturePassword='fixture-account-password';
        const hash=await bcrypt.hash(fixturePassword,4);
        for(const [id,name,role,verified,active] of [[1,'one','operator',1,1],[2,'two','operator',1,1],[3,'reviewer','admin',1,1],[4,'superadmin','superadmin',1,1],[5,'pending','operator',0,1],[6,'disabled','admin',1,0],[7,'another-super','superadmin',1,1]])await conn.query('INSERT INTO users (id,username,password,role,is_verified,is_active) VALUES (?,?,?,?,?,?)',[id,name,hash,role,verified,active]);
        const db={promise:()=>conn,query(sql,args,callback){if(typeof args==='function'){callback=args;args=[]}conn.query(sql,args).then(([rows])=>callback(null,rows),callback)}};
        const sessions=createPermitSessions(db);
        const people=createPeople(db,sessions,async()=>({query:(...a)=>conn.query(...a),beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),end:async()=>{}}));
        await people.initialize();
        const app=express();app.use(express.json());app.use(sessions.resolve);app.use('/api',sessions.protectWrites);
        app.use('/api/auth',require('./authServer')(db,sessions));app.use('/api',people.router);
        server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
        const origin='http://127.0.0.1:'+server.address().port;
        const request=(url,cookie='',body,method=body===undefined?'GET':'POST',headers={})=>fetch(origin+'/api'+url,{method,headers:{'x-permit-request':'1','Content-Type':'application/json',origin,cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const login=async(username,password=fixturePassword)=>{const res=await request('/auth/login','',{username,password});assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0]};
        let cookie=await login('one');const other=await login('two'),admin=await login('reviewer'),superCookie=await login('superadmin');
        const directory=async(cookieValue=cookie)=>{const res=await request('/people',cookieValue);assert.equal(res.status,200);return (await res.json()).people};
        await t.test('only approved accounts; hidden account stays hidden after rename; no secrets',async()=>{
            assert.equal((await request('/people')).status,401);
            assert.equal((await request('/profile',cookie,undefined,'GET',{'x-user-id':'2'})).status,409);
            let rows=await directory();assert.deepEqual(rows.map(p=>p.id).sort(),[1,2,3,7]);
            assert.ok(rows.every(p=>p.status==='offline'));
            assert.ok(rows.every(p=>Object.keys(p).sort().join(',')==='avatar_color,bio,display_name,id,role,status,username'));
            await conn.query("UPDATE users SET username='renamed-built-in' WHERE id=4");await people.initialize();
            assert.ok(!(await directory(superCookie)).some(p=>p.id===4));
            assert.ok((await directory(admin)).some(p=>p.id===7));
        });
        await t.test('self-only profile writes validate fields and preserve username/role',async()=>{
            assert.equal((await request('/profile',cookie,{id:2,display_name:'No',bio:'',avatar_color:'blue'},'PUT')).status,400);
            assert.equal((await request('/profile',cookie,{display_name:'  ',bio:'',avatar_color:'blue'},'PUT')).status,400);
            assert.equal((await request('/profile',cookie,{display_name:'One',bio:'x'.repeat(301),avatar_color:'blue'},'PUT')).status,400);
            assert.equal((await request('/profile',cookie,{display_name:'One',bio:'',avatar_color:'url(bad)'},'PUT')).status,400);
            const body={display_name:'  First Person ',bio:' Team member ',avatar_color:'green'};
            assert.equal((await request('/profile',cookie,body,'PUT',{origin:'https://untrusted.example'})).status,403);
            assert.equal((await request('/profile',cookie,body,'PUT')).status,200);
            const profile=(await (await request('/profile',cookie)).json()).profile;
            assert.equal(profile.username,'one');assert.equal(profile.role,'operator');assert.equal(profile.display_name,'First Person');assert.equal(profile.bio,'Team member');
            assert.equal((await (await request('/profile',other)).json()).profile.display_name,'two');
            const found=await (await request('/people?q=first',cookie)).json();assert.deepEqual(found.people.map(p=>p.id),[1]);
        });
        await t.test('superadmin self-delete is rejected using session identity before any account is removed',async()=>{
            const res=await request('/auth/accounts/4',superCookie,undefined,'DELETE');
            assert.equal(res.status,400);assert.match((await res.json()).message,/cannot delete your own account/);
            assert.equal((await request('/auth/accounts/4',superCookie,undefined,'DELETE',{'x-user-id':'7'})).status,409);
            assert.equal((await conn.query('SELECT id FROM users WHERE id=4'))[0].length,1);
            assert.equal((await request('/profile',superCookie)).status,200);
        });
        await t.test('People excludes exact admin before searching, without hiding other admins or disabling the account',async()=>{
            for(const [id,name,role] of [[8,'admin','admin'],[9,'Admin','admin'],[10,'admin-assistant','operator']])await conn.query('INSERT INTO users (id,username,password,role,is_verified,is_active) VALUES (?,?,?,?,1,1)',[id,name,hash,role]);
            await conn.query("INSERT INTO permit_user_profiles (user_id,display_name) VALUES (8,'Boss Display'),(10,'admin')");
            const rows=await directory();assert.ok(!rows.some(person=>person.id===8));
            for(const id of [3,9,10])assert.ok(rows.some(person=>person.id===id));
            const found=(await (await request('/people?q=admin',admin)).json()).people;
            assert.deepEqual(found.map(person=>person.id).sort((a,b)=>a-b),[9,10]);
            assert.equal((await (await request('/people?q=Boss%20Display',admin)).json()).people.length,0);
            const adminCookie=await login('admin');
            assert.equal((await (await request('/profile',adminCookie)).json()).profile.username,'admin');
            const stored=(await conn.query('SELECT role,is_active,is_verified FROM users WHERE id=8'))[0][0];
            assert.deepEqual(stored,{role:'admin',is_active:1,is_verified:1});
        });
        await t.test('account listing returns one account row with all assignments, including shared stations',async()=>{
            await conn.query("INSERT INTO permit_station_assignments VALUES (1,'ELECTRICAL','Electrical'),(1,'SANITARY','Sanitary'),(2,'ELECTRICAL','Electrical')");
            const res=await request('/auth/accounts',superCookie);assert.equal(res.status,200);
            const {users}=await res.json();assert.equal(new Set(users.map(user=>user.id)).size,users.length);
            assert.deepEqual(users.find(user=>user.id===1).assigned_stations,['Electrical','Sanitary']);
            assert.deepEqual(users.find(user=>user.id===2).assigned_stations,['Electrical']);
            assert.deepEqual(users.find(user=>user.id===4).assigned_stations,[]);assert.ok(users.some(user=>user.username==='admin'));
            assert.ok(users.every(user=>!Object.hasOwn(user,'password')));
            assert.equal((await request('/auth/accounts',cookie)).status,403);
        });
        await t.test('online, away, idle, logout, expired sessions and another active tab',async()=>{
            assert.equal((await request('/presence',cookie,{active:true})).status,200);
            assert.equal((await directory()).find(p=>p.id===1).status,'online');
            await request('/presence',cookie,{active:false});
            assert.equal((await directory()).find(p=>p.id===1).status,'online','inactive tab must not clear another tab activity');
            await conn.query('UPDATE permit_presence SET last_active=NOW(3)-INTERVAL 6 MINUTE');
            assert.equal((await directory()).find(p=>p.id===1).status,'away');
            await conn.query('UPDATE permit_presence SET last_seen=NOW(3)-INTERVAL 2 MINUTE');
            assert.equal((await directory()).find(p=>p.id===1).status,'offline');
            const secondDevice=await login('one');assert.equal((await request('/profile',cookie)).status,401);await request('/presence',secondDevice,{active:true});
            await request('/auth/logout',secondDevice,{});
            assert.equal((await directory(admin)).find(p=>p.id===1).status,'offline');
            await request('/presence',other,{active:true});await conn.query('UPDATE permit_sessions SET expires_at=NOW(3)-INTERVAL 1 SECOND WHERE user_id=2');
            assert.equal((await directory(admin)).find(p=>p.id===2).status,'offline');
            assert.equal((await request('/presence',other,{active:true})).status,401);
        });
        await t.test('password validation and change revoke all own sessions only',async()=>{
            const secondDevice=await login('one');
            cookie=await login('one');
            assert.equal((await request('/profile/password',cookie,{current_password:'wrong',new_password:'new123'})).status,400);
            assert.equal((await request('/profile/password',cookie,{current_password:fixturePassword,new_password:'short'})).status,400);
            const changed=await request('/profile/password',cookie,{current_password:fixturePassword,new_password:'new123'});
            assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0|Expires=Thu, 01 Jan 1970/);
            assert.equal((await request('/profile',cookie)).status,401);assert.equal((await request('/profile',secondDevice)).status,401);
            assert.equal((await request('/profile',admin)).status,200);
            await assert.rejects(sessions.issue({headers:{}},{cookie(){assert.fail('Stale login must not receive a cookie')}},{id:1,password:hash,role:'operator'}),{code:'ACCOUNT_CHANGED'});
            assert.equal((await request('/auth/login','',{username:'one',password:fixturePassword})).status,401);
            assert.ok(await login('one','new123'));
            assert.ok(await bcrypt.compare('new123',(await conn.query('SELECT password FROM users WHERE id=1'))[0][0].password));
        });
        await t.test('search pagination is stable and password attempts are limited',async()=>{
            for(let id=20;id<53;id++)await conn.query('INSERT INTO users (id,username,password,role,is_verified,is_active) VALUES (?,?,?,?,1,1)',[id,'paged-'+id,hash,'operator']);
            const first=await (await request('/people?q=paged-',admin)).json();assert.equal(first.people.length,30);assert.equal(first.hasMore,true);
            const next=await (await request('/people?q=paged-&page=2',admin)).json();assert.equal(next.people.length,3);assert.equal(next.hasMore,false);
            assert.equal(new Set([...first.people,...next.people].map(p=>p.id)).size,33);
            assert.equal((await request('/people?page=-1',admin)).status,400);
            for(let i=0;i<5;i++)assert.equal((await request('/profile/password',admin,{current_password:'wrong',new_password:'new123'})).status,400);
            assert.equal((await request('/profile/password',admin,{current_password:'wrong',new_password:'new123'})).status,429);
        });
    } finally {if(server)await new Promise(resolve=>server.close(resolve));await conn.end()}
});
