/** Server-owned permit identity. Only random cookie tokens leave the server;
 * their SHA-256 hashes are stored. User activity/role is rechecked on every request.
 * Configure PERMIT_PUBLIC_ORIGIN and PERMIT_COOKIE_SECURE=true behind HTTPS.
 */
const crypto = require('node:crypto');
const COOKIE = process.env.PERMIT_COOKIE_NAME || 'permit_session';
const roles = ['operator', 'admin', 'superadmin'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const replacedMessage = 'Your account was signed in somewhere else, so this session has ended. Please sign in again to continue.';
const publicSessionId = tokenHash => hash('session-notice:' + tokenHash);
function readToken(req, cookieName = COOKIE) {
    const value = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
function sessionHash(req) { const value=readToken(req);return value ? hash(value) : null; }
function createPermitSessions(db, options = {}) {
    const cookieName=options.cookieName || COOKIE;
    const token=req=>readToken(req,cookieName);
    const query = async (sql, params=[]) => (await db.promise().query(sql,params))[0];
    const ttl = options.ttlMs || 8*60*60*1000;
    const idleMs = Math.min(options.idleMs || 30*60*1000, ttl);
    const secure = options.secure ?? process.env.PERMIT_COOKIE_SECURE === 'true';
    const cookieOptions = {httpOnly:true, sameSite:'strict', secure, path:'/'};
    async function initialize() {
        await query(`CREATE TABLE IF NOT EXISTS permit_sessions (
            token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL,
            expires_at DATETIME(3) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX sessions_user (user_id), INDEX sessions_expiry (expires_at)
        ) ENGINE=InnoDB`);
        // Short-lived receipts explain replacement without retaining credentials
        // or allowing a revoked token to authenticate again.
        await query(`CREATE TABLE IF NOT EXISTS permit_session_replacements (
            token_hash CHAR(64) PRIMARY KEY, expires_at DATETIME(3) NOT NULL,
            INDEX replacements_expiry (expires_at)
        ) ENGINE=InnoDB`);
        await query('DELETE FROM permit_sessions WHERE expires_at <= NOW(3)');
        await query('DELETE FROM permit_session_replacements WHERE expires_at <= NOW(3)');
        // Bring existing sessions under the idle limit without extending them.
        const idleDeadline=new Date(Date.now()+idleMs);
        await query('UPDATE permit_sessions SET expires_at=? WHERE expires_at>?',[idleDeadline,idleDeadline]);
    }
    async function issue(req,res,user) {
        const value=crypto.randomBytes(32).toString('hex');
        const database=db.promise();
        const connection=options.openConnection ? await options.openConnection() :
            database.getConnection ? await database.getConnection() : database;
        const owned=!!options.openConnection || !!database.getConnection;
        try {
            await connection.beginTransaction();
            // Both applications lock the same account before replacing its
            // sessions. Concurrent logins cannot leave two valid sessions.
            // Recheck the exact credentials after asynchronous password checking.
            const [users]=await connection.query(`SELECT id FROM users
                WHERE id=? AND password=? AND role=? AND is_active=1 AND is_verified=1 FOR UPDATE`,
                [user.id,user.password,user.role]);
            if(!users.length){const error=new Error('Account changed during sign in.');error.code='ACCOUNT_CHANGED';throw error;}
            await connection.query('DELETE FROM permit_session_replacements WHERE expires_at <= NOW(3)');
            await connection.query(`INSERT INTO permit_session_replacements (token_hash,expires_at)
                SELECT token_hash,expires_at FROM permit_sessions WHERE user_id=? AND expires_at>NOW(3)`,[user.id]);
            await connection.query('DELETE FROM permit_sessions WHERE user_id=?',[user.id]);
            const [result]=await connection.query('INSERT INTO permit_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',
                [hash(value),user.id,new Date(Date.now()+idleMs)]);
            if(result.affectedRows!==1)throw new Error('Session could not be created.');
            await connection.commit();
        } catch(error) {
            try { await connection.rollback(); } catch {}
            throw error;
        } finally {
            if(owned){if(connection.release)connection.release();else await connection.end();}
        }
        res.cookie(cookieName,value,{...cookieOptions,maxAge:ttl});
        return publicSessionId(hash(value));
    }
    async function activeUser(tokenHash) {
        const rows=await query(`SELECT u.id,u.username,u.role,s.expires_at,s.created_at FROM permit_sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at>NOW(3) AND u.is_active=1 AND u.is_verified=1
            AND s.token_hash=(SELECT latest.token_hash FROM permit_sessions latest
                WHERE latest.user_id=s.user_id AND latest.expires_at>NOW(3)
                ORDER BY latest.created_at DESC,latest.token_hash DESC LIMIT 1)`,[tokenHash]);
        const row=rows[0];
        if(row && new Date(row.created_at).getTime()+ttl<=Date.now())return null;
        return row && roles.includes(row.role) ? {id:row.id,username:row.username,role:row.role,
            session_id:publicSessionId(tokenHash),session_remaining_ms:Math.max(0,new Date(row.expires_at).getTime()-Date.now()),
            session_absolute_expires_at:new Date(new Date(row.created_at).getTime()+ttl).toISOString()} : null;
    }
    function clearCookie(res) { res.clearCookie(cookieName,cookieOptions); }
    async function logout(req,res) {
        const value=token(req);
        if(value) await query('DELETE FROM permit_sessions WHERE token_hash=?',[hash(value)]);
        clearCookie(res);
    }
    async function resolve(req,res,next) {
        try {
            req.user=null;
            req.sessionReplaced=false;
            const value=token(req);
            if(value) {
                const tokenHash=hash(value);
                req.user=await activeUser(tokenHash);
                if(!req.user) {
                    const notices=await query('SELECT token_hash FROM permit_session_replacements WHERE token_hash=? AND expires_at>NOW(3)',[tokenHash]);
                    req.sessionReplaced=notices.length>0;
                }
            }
            next();
        } catch(error) { console.error('Session lookup failed:',error.message);res.status(503).json({success:false,message:'Sign-in service is unavailable. Please try again.'}); }
    }
    function requireUser(req,res,next) {
        res.set('Cache-Control','no-store');
        if(!req.user) return res.status(401).json(req.sessionReplaced
            ? {success:false,code:'SESSION_REPLACED',message:replacedMessage}
            : {success:false,message:'Please sign in again. Your session has expired or ended.'});
        // Identity headers never grant access. A mismatch only blocks stale tabs.
        const expected=req.get('x-user-id');
        if(expected && String(req.user.id)!==expected) return res.status(409).json({success:false,sessionChanged:true,message:'The signed-in account changed in another tab. Refresh before continuing.'});
        const expectedSession=req.get('x-session-id');
        if(expectedSession && req.user.session_id!==expectedSession)return res.status(409).json({success:false,sessionChanged:true,message:'The signed-in session changed in another tab.'});
        next();
    }
    async function activity(req,res) {
        try {
            const tokenHash=hash(token(req));
            const deadline=new Date(Math.min(Date.now()+idleMs,new Date(req.user.session_absolute_expires_at).getTime()));
            // Conditional update cannot revive an expired/replaced token, and
            // out-of-order activity requests cannot shorten a newer deadline.
            await query('UPDATE permit_sessions SET expires_at=? WHERE token_hash=? AND expires_at>NOW(3) AND expires_at<?',
                [deadline,tokenHash,deadline]);
            req.user=await activeUser(tokenHash);
            requireUser(req,res,()=>res.json({success:true,user:req.user}));
        }catch(error){res.status(503).json({success:false,message:'Could not keep your session active. Please try again.'});}
    }
    function requireRoles(...allowed) {
        return (req,res,next) => requireUser(req,res,()=>allowed.includes(req.user.role)?next():res.status(403).json({success:false,message:'Your account does not have permission for this action.'}));
    }
    function protectWrites(req,res,next) {
        if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
        const expected=process.env.PERMIT_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
        const origin=req.get('origin');
        if(req.get('x-permit-request')!=='1' || (origin && origin!==expected) || req.get('sec-fetch-site')==='cross-site') {
            return res.status(403).json({success:false,message:'Open the permit system directly and try again.'});
        }
        next();
    }
    return {initialize,issue,logout,activity,clearCookie,resolve,requireUser,requireRoles,protectWrites,
        isActiveSession:async tokenHash=>!!await activeUser(tokenHash)};
}
module.exports={createPermitSessions,sessionHash};
