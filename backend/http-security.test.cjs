const test=require('node:test'),assert=require('node:assert/strict');
const express=require('./monitorBP backend/node_modules/express');
const security=require('./http-security');
const createLimits=require('./monitorBP backend/authLimits');

async function fixture(env={},routes=()=>{}) {
    const app=express();security(app,env);app.use(express.json());
    app.get('/address',(req,res)=>res.json({ip:security.clientAddress(req)}));
    app.get('/login',(req,res)=>res.type('html').send('<script>window.ready=true</script><button onclick="window.ready=true">Test</button>'));
    routes(app);
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    return {app,origin:'http://127.0.0.1:'+server.address().port,
        close:()=>new Promise(resolve=>server.close(resolve))};
}

test('direct connections ignore forged forwarding headers',async()=>{
    const f=await fixture();
    try {
        assert.equal(f.app.get('trust proxy'),false);
        const response=await fetch(f.origin+'/address',{headers:{'X-Forwarded-For':'198.51.100.8','X-Forwarded-Proto':'https'}});
        assert.equal((await response.json()).ip,'127.0.0.1');
    } finally {await f.close();}
});

test('explicit proxy trust resolves distinct clients and ignores a forged leftmost address',async()=>{
    const f=await fixture({OFFICE_TRUST_PROXY:'127.0.0.1/32'});
    try {
        for(const client of ['192.0.2.10','192.0.2.20']) {
            const response=await fetch(f.origin+'/address',{headers:{'X-Forwarded-For':'198.51.100.99, '+client}});
            assert.equal((await response.json()).ip,client);
        }
        const invalid=await fetch(f.origin+'/address',{headers:{'X-Forwarded-For':'not-an-IP'}});
        assert.equal((await invalid.json()).ip,'127.0.0.1');
    } finally {await f.close();}
});

test('one proxy client cannot exhaust another client login bucket',async()=>{
    const limits=createLimits();
    const f=await fixture({OFFICE_TRUST_PROXY:'127.0.0.1/32'},app=>{
        app.post('/login',limits.login,(req,res)=>res.status(401).json({success:false}));
    });
    const attempt=(client,username,spoof='198.51.100.1')=>fetch(f.origin+'/login',{method:'POST',
        headers:{'Content-Type':'application/json','X-Forwarded-For':spoof+', '+client},body:JSON.stringify({username})});
    try {
        for(let n=0;n<100;n++)assert.equal((await attempt('192.0.2.10','user-'+n)).status,401);
        assert.equal((await attempt('192.0.2.10','new-user','198.51.100.2')).status,429);
        assert.equal((await attempt('192.0.2.20','new-user')).status,401);
    } finally {await f.close();}
});

test('proxy configuration accepts IP/CIDR allowlists and rejects unrestricted or ambiguous trust',()=>{
    const app=express();security(app,{OFFICE_TRUST_PROXY:'127.0.0.1/32,10.20.0.0/16,::1/128'});
    assert.equal(app.get('trust proxy fn')('127.0.0.1'),true);
    assert.equal(app.get('trust proxy fn')('192.0.2.10'),false);
    for(const setting of ['true','1','0.0.0.0/0','::/0','127.0.0.1/33','::1/129','hostname','127.0.0.1,'])
        assert.throws(()=>security(express(),{OFFICE_TRUST_PROXY:setting}),/OFFICE_TRUST_PROXY/);
});

test('security headers protect framing and keep inline UI compatibility during CSP rollout',async()=>{
    const f=await fixture();
    try {
        const response=await fetch(f.origin+'/login');
        assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
        assert.equal(response.headers.get('x-content-type-options'),'nosniff');
        assert.equal(response.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
        assert.equal(response.headers.get('x-powered-by'),null);
        const enforced=response.headers.get('content-security-policy');
        assert.match(enforced,/frame-ancestors 'self'/);
        assert.match(enforced,/object-src 'none'/);
        assert.doesNotMatch(enforced,/script-src|style-src|default-src|connect-src|upgrade-insecure-requests/);
        const reportOnly=response.headers.get('content-security-policy-report-only');
        assert.match(reportOnly,/script-src 'self'/);
        assert.match(reportOnly,/http:\/\/localhost:5000/);
        assert.match(reportOnly,/ws:\/\/127\.0\.0\.1:5000/);
        assert.match(reportOnly,/media-src.*https:\/\/res\.cloudinary\.com/);
        assert.doesNotMatch(reportOnly,/upgrade-insecure-requests/);
        assert.match(await response.text(),/onclick=/);
    } finally {await f.close();}
});

test('preview network restrictions retain the enforced framing policy',async()=>{
    const previous=process.env.OFFICE_PG_PREVIEW;
    process.env.OFFICE_PG_PREVIEW='1';
    const f=await fixture({},app=>{
        require('./database/preview')(app,__dirname);
        app.get('/preview',(req,res)=>res.send('Preview'));
    });
    try {
        const response=await fetch(f.origin+'/preview');
        assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'/);
        assert.match(response.headers.get('content-security-policy'),/connect-src 'self' http:\/\/127\.0\.0\.1/);
        assert.match(response.headers.get('content-security-policy-report-only'),/script-src/);
    } finally {
        await f.close();
        if(previous===undefined)delete process.env.OFFICE_PG_PREVIEW;else process.env.OFFICE_PG_PREVIEW=previous;
    }
});

test('IPv4 mapped clients share the same address key',()=>{
    assert.equal(security.clientAddress({ip:'::ffff:192.0.2.10'}),'192.0.2.10');
    assert.equal(security.clientAddress({ip:'invalid',socket:{remoteAddress:'192.0.2.20'}}),'192.0.2.20');
});
