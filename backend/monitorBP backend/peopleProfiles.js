/** People/profile APIs. Identity always comes from the session middleware.
 * Profiles do not rename login accounts or rewrite historical audit actors.
 * Presence is per session: logout/revocation/expiry automatically removes it
 * from the directory query, even if an old heartbeat row remains.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const passwordPolicy = require('./passwordPolicy');
const {sessionHash} = require('./permitSessions');
const colors = ['blue', 'green', 'purple', 'rose', 'amber', 'slate'];
const schema = [
    `CREATE TABLE IF NOT EXISTS permit_user_profiles (
        user_id INT PRIMARY KEY, display_name VARCHAR(80) NOT NULL DEFAULT '',
        bio VARCHAR(300) NOT NULL DEFAULT '', avatar_color VARCHAR(16) NOT NULL DEFAULT 'blue'
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS permit_presence (
        session_hash CHAR(64) PRIMARY KEY, last_seen DATETIME(3) NOT NULL,
        last_active DATETIME(3) NULL, INDEX presence_seen (last_seen)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS permit_people_settings (
        setting_key VARCHAR(50) PRIMARY KEY, user_id INT NOT NULL
    ) ENGINE=InnoDB`
];
module.exports = function peopleProfiles(db, sessions, connect) {
    const query = async (sql, args=[]) => (await db.promise().query(sql,args))[0];
    async function initialize() {
        for (const sql of schema) await query(sql);
        // Capture the built-in account once. The stored ID survives a later rename.
        // Never identify a person by their password or return this setting to clients.
        await query(`INSERT IGNORE INTO permit_people_settings (setting_key,user_id)
            SELECT 'hidden_account',id FROM users WHERE username='superadmin' AND role='superadmin' ORDER BY id LIMIT 1`);
        await query('DELETE FROM permit_presence WHERE last_seen < NOW(3) - INTERVAL 1 DAY');
    }
    const router=express.Router();
    router.use(sessions.requireUser);
    const wrap=fn=>async(req,res)=>{try {await fn(req,res);}catch(error){console.error('People/profile request failed:',error.code || error.name);res.status(503).json({success:false,message:'Could not complete this request. Please try again.'});}};
    const bad=(res,message)=>res.status(400).json({success:false,message});
    router.get('/profile',wrap(async(req,res)=>{
        const rows=await query(`SELECT u.id,u.username,u.role,COALESCE(NULLIF(p.display_name,''),u.username) AS display_name,
            COALESCE(p.bio,'') AS bio,COALESCE(p.avatar_color,'blue') AS avatar_color
            FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.id=?`,[req.user.id]);
        res.json({success:true,profile:rows[0]});
    }));
    router.put('/profile',wrap(async(req,res)=>{
        const body=req.body;
        if(!body || Object.keys(body).some(key=>!['display_name','bio','avatar_color'].includes(key)))return bad(res,'Only your display name, bio and avatar color can be edited here.');
        if(typeof body.display_name!=='string' || !body.display_name.trim() || body.display_name.trim().length>80)return bad(res,'Enter a display name of 1–80 characters.');
        if(typeof body.bio!=='string' || body.bio.trim().length>300)return bad(res,'Keep your bio within 300 characters.');
        if(!colors.includes(body.avatar_color))return bad(res,'Choose an available avatar color.');
        await query(`INSERT INTO permit_user_profiles (user_id,display_name,bio,avatar_color) VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),bio=VALUES(bio),avatar_color=VALUES(avatar_color)`,
            [req.user.id,body.display_name.trim(),body.bio.trim(),body.avatar_color]);
        res.json({success:true,message:'Profile saved.'});
    }));
    router.post('/presence',wrap(async(req,res)=>{
        if(typeof req.body?.active!=='boolean')return bad(res,'Activity state is required.');
        const key=sessionHash(req);
        if(!key)return res.status(401).json({success:false,message:'Please sign in again.'});
        await query(`INSERT INTO permit_presence (session_hash,last_seen,last_active) VALUES (?,NOW(3),IF(?,NOW(3),NULL))
            ON DUPLICATE KEY UPDATE last_seen=NOW(3),last_active=IF(?,NOW(3),last_active)`,[key,req.body.active,req.body.active]);
        res.json({success:true});
    }));
    router.get('/people',wrap(async(req,res)=>{
        const search=String(req.query.q || '').trim().slice(0,80);
        const page=Number(req.query.page || 1);
        if(!Number.isSafeInteger(page)||page<1||page>10000)return bad(res,'Invalid page.');
        const rows=await query(`SELECT u.id,u.username,u.role,COALESCE(NULLIF(p.display_name,''),u.username) AS display_name,
            COALESCE(p.bio,'') AS bio,COALESCE(p.avatar_color,'blue') AS avatar_color,
            CASE WHEN MAX(pr.last_seen)>NOW(3)-INTERVAL 90 SECOND
                THEN IF(MAX(IF(pr.last_seen>NOW(3)-INTERVAL 90 SECOND,pr.last_active,NULL))>NOW(3)-INTERVAL 5 MINUTE,'online','away')
                ELSE 'offline' END AS status
            FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id
            LEFT JOIN permit_sessions s ON s.user_id=u.id AND s.expires_at>NOW(3)
            LEFT JOIN permit_presence pr ON pr.session_hash=s.token_hash
            WHERE u.is_verified=1 AND u.is_active=1
              AND BINARY u.username <> BINARY 'admin'
              AND NOT EXISTS (SELECT 1 FROM permit_people_settings h WHERE h.setting_key='hidden_account' AND h.user_id=u.id)
              AND (?='' OR LOCATE(LOWER(?),LOWER(CONCAT(u.username,' ',COALESCE(p.display_name,''))))>0)
            GROUP BY u.id,u.username,u.role,p.display_name,p.bio,p.avatar_color
            ORDER BY display_name,u.id LIMIT 31 OFFSET ?`,[search,search,(page-1)*30]);
        res.json({success:true,people:rows.slice(0,30),hasMore:rows.length>30});
    }));
    // Limit expensive current-password comparisons per account, without logging secrets.
    const attempts=new Map();
    router.post('/profile/password',wrap(async(req,res)=>{
        const now=Date.now();
        for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
        const attempt=attempts.get(req.user.id)||{count:0,until:now+15*60*1000};
        if(attempt.count>=5)return res.status(429).json({success:false,message:'Too many password attempts. Try again in 15 minutes.'});
        const {current_password:current,new_password:next}=req.body || {};
        if(typeof current!=='string'||!current||Buffer.byteLength(current)>72)return bad(res,'Enter your current password.');
        const passwordError = passwordPolicy(next);
        if(passwordError)return bad(res,passwordError);
        if(next===current)return bad(res,'Choose a different password.');
        attempt.count++;attempts.set(req.user.id,attempt);
        const rows=await query('SELECT password FROM users WHERE id=?',[req.user.id]);
        if(!rows[0] || !await bcrypt.compare(current,rows[0].password))return bad(res,'Your current password is incorrect.');
        const replacement=await bcrypt.hash(next,10);
        // Dedicated connection prevents transaction boundaries affecting other requests.
        const connection=await connect();
        try {
            await connection.beginTransaction();
            const [result]=await connection.query('UPDATE users SET password=? WHERE id=? AND password=? AND is_active=1 AND is_verified=1',[replacement,req.user.id,rows[0].password]);
            if(result.affectedRows!==1){await connection.rollback();return res.status(409).json({success:false,message:'Your account changed. Please sign in again before changing your password.'});}
            await connection.query('DELETE FROM permit_sessions WHERE user_id=?',[req.user.id]);
            await connection.commit();
        } catch(error){await connection.rollback();throw error;}
        finally {await connection.end();}
        attempts.delete(req.user.id);
        sessions.clearCookie(res);
        res.json({success:true,message:'Password changed. Please sign in again. All previous sessions have ended.'});
    }));
    return {initialize,router};
};
module.exports.schema=schema;
