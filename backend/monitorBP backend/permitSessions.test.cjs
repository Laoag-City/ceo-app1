const {test} = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('node:path');
const {createPermitSessions} = require('./permitSessions');

test('HTTP cookie sessions: four users, forged identity, role checks, rotation, logout, expiry and revocation', async () => {
    const conn=await mysql.createConnection({host:'localhost',user:'root',database:'permit_system'});
    let server;
    try {
        // Shadow real tables on a single isolated connection, including auth-router queries.
        await conn.query('CREATE TEMPORARY TABLE users (id INT PRIMARY KEY, username VARCHAR(50), password VARCHAR(255), role VARCHAR(20), is_verified INT, is_active INT)');
        await conn.query('CREATE TEMPORARY TABLE permit_sessions (token_hash CHAR(64) PRIMARY KEY,user_id INT,expires_at DATETIME(3),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await conn.query('CREATE TEMPORARY TABLE permit_session_replacements (token_hash CHAR(64) PRIMARY KEY,expires_at DATETIME(3))');
        const password=await bcrypt.hash('test-session-password',4);
        for(const [id,role] of [[1,'operator'],[2,'operator'],[3,'admin'],[4,'superadmin']]) await conn.query('INSERT INTO users VALUES (?,?,?,?,1,1)',[id,'test'+id,password,role]);
        const db={promise:()=>conn,query(sql,args,callback){if(typeof args==='function'){callback=args;args=[];}conn.query(sql,args).then(([rows])=>callback(null,rows),callback);}};
        const sessions=createPermitSessions(db);
        const app=express();app.use(express.json());app.use(sessions.resolve);app.use('/api',sessions.protectWrites);
        app.use('/api/auth',require('./authServer')(db,sessions));
        app.get('/api/private',sessions.requireUser,(req,res)=>res.json(req.user));
        app.post('/api/review',sessions.requireRoles('admin','superadmin'),(req,res)=>res.json({actor:req.user.id}));
        app.use(require('./permitPages')(path.join(__dirname,'../../frontend/monitorBP frontend')));
        server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
        const origin='http://127.0.0.1:'+server.address().port;
        const request=(url, cookie='', body, headers={})=>fetch(origin+url,{method:body===undefined?'GET':'POST',headers:{'x-permit-request':'1','Content-Type':'application/json',origin,...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
        async function login(id,cookie='') {
            const response=await request('/api/auth/login',cookie,{username:'test'+id,password:'test-session-password'});
            assert.equal(response.status,200);const set=response.headers.get('set-cookie');assert.match(set,/HttpOnly/i);assert.match(set,/SameSite=Strict/i);
            return set.split(';')[0];
        }
        const cookies=[];for(const id of [1,2,3,4])cookies.push(await login(id));
        assert.equal(new Set(cookies).size,4);
        const page=(url,cookie='')=>fetch(origin+url,{headers:{cookie},redirect:'manual'});
        const root=await page('/');
        assert.equal(root.status,302);
        assert.equal(root.headers.get('location'),'/portal.html');
        for(const url of ['/index.html','/%69ndex.html','/INDEX.HTML','/edit','/occupancy','/occupancy_edit.html','/admin','/superadmin']) {
            const response=await page(url);assert.equal(response.status,302,url);assert.equal(response.headers.get('location'),'/login');
        }
        assert.equal((await page('/superadmin',cookies[0])).headers.get('location'),'/index.html');
        assert.equal((await page('/superadmin',cookies[2])).headers.get('location'),'/admin');
        assert.equal((await page('/occupancy',cookies[3])).headers.get('location'),'/superadmin');
        for(const [url,cookie] of [['/index.html',cookies[0]],['/admin',cookies[2]],['/superadmin',cookies[3]]]) {
            const response=await page(url,cookie);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
            assert.match(await response.text(),/sessionStorage.setItem\("oboUser"/);
        }
        for(let i=0;i<4;i++) assert.equal((await (await request('/api/private',cookies[i])).json()).id,i+1);
        assert.equal((await request('/api/private','',undefined,{'x-user-id':'4','x-user-role':'superadmin'})).status,401);
        assert.equal((await request('/api/review',cookies[0],{}, {'x-user-role':'superadmin'})).status,403);
        assert.equal((await request('/api/review',cookies[0],{}, {'x-user-id':'4'})).status,409);
        assert.equal((await request('/api/review',cookies[2],{})).status,200);
        assert.equal((await request('/api/review',cookies[3],{})).status,200);
        assert.equal((await request('/api/auth/accounts',cookies[2])).status,403);
        assert.equal((await request('/api/review',cookies[3],{}, {origin:'https://untrusted.example'})).status,403);
        assert.equal((await request('/api/review',cookies[3],{}, {'x-permit-request':''})).status,403);
        const otherDevice=await login(1);
        assert.equal((await request('/api/private',cookies[0])).status,401);
        const rotated=await login(1,cookies[0]);
        assert.notEqual(rotated,cookies[0]);
        assert.equal((await request('/api/private',cookies[0])).status,401);
        assert.equal((await request('/api/auth/logout',rotated,{})).status,200);
        assert.equal((await request('/api/private',rotated)).status,401);
        assert.equal((await request('/api/private',otherDevice)).status,401);
        assert.equal((await request('/api/private',cookies[1])).status,200);
        await conn.query("UPDATE users SET role='operator' WHERE id=3");
        assert.equal((await request('/api/review',cookies[2],{})).status,403);
        await conn.query('UPDATE users SET is_active=0 WHERE id=4');
        assert.equal((await request('/api/private',cookies[3])).status,401);
        await conn.query('UPDATE permit_sessions SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE user_id=2');
        assert.equal((await request('/api/private',cookies[1])).status,401);
        const rows=(await conn.query('SELECT token_hash FROM permit_sessions'))[0];
        assert.ok(rows.every(row=>!cookies.some(cookie=>cookie.endsWith(row.token_hash))));
        const bad=await request('/api/auth/login','',{username:'test1',password:'wrong'});
        assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
    } finally {if(server) await new Promise(resolve=>server.close(resolve));await conn.end();}
});
