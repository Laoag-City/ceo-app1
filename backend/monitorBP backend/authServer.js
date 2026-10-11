/**
 * MAINTAINER GUIDE
 * Permit account registration, password verification, and account administration.
 * New registrations require approval; login returns the user object used by frontend routing.
 * Identity and roles come from permitSessions; client-supplied identity headers never authorize requests.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const createAuthLimits = require('./authLimits');
const passwordPolicy = require('./passwordPolicy');


module.exports = function(db, sessions, openConnection) {
    const router = express.Router();
    const limits = createAuthLimits();
    const ensureSuperAdmin = (req, res, next) => {
        const role = (req.user?.role || '').toLowerCase();
        if (role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only super administrators can manage accounts.' });
        }
        next();
    };

    router.post('/register', limits.register, (req, res) => {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const requestedRole = (req.body?.role || 'operator').toString().trim().toLowerCase();

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'All credentials are required.' });
        }

        const passwordError = passwordPolicy(password);
        if (passwordError) return res.status(400).json({success: false, message: passwordError});
        if (username.length > 50) return res.status(400).json({success: false, message: 'Keep your username within 50 characters.'});

        if (!['operator', 'admin'].includes(requestedRole)) {
            return res.status(400).json({ success: false, message: 'Role must be operator or admin.' });
        }

        db.query("SELECT id FROM users WHERE username = ?", [username], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (results.length > 0) {
                return res.status(400).json({ success: false, message: 'Username is already taken.' });
            }

            try {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                db.query(
                    "INSERT INTO users (username, password, role, is_verified, is_active) VALUES (?, ?, ?, 0, 0)",
                    [username, hashedPassword, requestedRole],
                    (insertErr) => {
                        if (insertErr) return res.status(500).json({ success: false, message: insertErr.message });
                        res.json({ success: true, message: 'Registration submitted. An administrator must approve your account before you can sign in.' });
                    }
                );
            } catch (hashError) {
                res.status(500).json({ success: false, message: 'Encryption pipeline failure.' });
            }
        });
    });

    router.post('/login', limits.login, (req, res) => {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!username || !password || username.length > 50 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({ success: false, message: 'Enter a valid username and password (maximum 72 UTF-8 bytes).' });
        }

        db.query(
            "SELECT id, username, password, role, is_verified, is_active FROM users WHERE username = ? LIMIT 1",
            [username],
            async (err, results) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                if (results.length === 0) {
                    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
                }

                const user = results[0];
                if (!user.is_active || !user.is_verified) {
                    return res.status(403).json({ success: false, message: 'Your account is pending approval.' });
                }

                try {
                    const isMatch = await bcrypt.compare(password, user.password);
                    if (!isMatch) {
                        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
                    }

                    const sessionId=await sessions.issue(req,res,user);

                    res.json({ success:true, message: 'Login successful.',
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            session_id: sessionId
                        }
                    });
                } catch (compareErr) {
                    if(compareErr.code==='ACCOUNT_CHANGED') {
                        sessions.clearCookie(res);
                        return res.status(409).json({success:false,message:'Your account changed. Please sign in again.'});
                    }
                    res.status(500).json({ success: false, message: 'Authentication comparison failed.' });
                }
            }
        );
    });

    router.get('/session', sessions.requireUser, (req,res)=>res.json({success:true,user:req.user}));
    router.post('/logout', async (req,res)=>{
        try { await sessions.logout(req,res); res.json({success:true}); }
        catch(error) { res.status(503).json({success:false,message:'Could not finish signing out. Please try again.'}); }
    });
    router.use(sessions.requireUser);
    router.use(require('./accountManagement')(openConnection,sessions));

    router.get('/accounts', ensureSuperAdmin, async (req, res) => {
        try{
            const [users]=await db.promise().query('SELECT id,username,role,is_verified,is_active,created_at FROM users ORDER BY created_at DESC,id');
            const [assignments]=await db.promise().query('SELECT user_id,station_name FROM permit_station_assignments ORDER BY station_key');
            const byUser=new Map();for(const assignment of assignments){if(!byUser.has(Number(assignment.user_id)))byUser.set(Number(assignment.user_id),[]);byUser.get(Number(assignment.user_id)).push(assignment.station_name);}
            res.json({success:true,users:users.map(user=>{const assigned=user.role==='operator'?(byUser.get(Number(user.id)) || []):[];return {...user,assigned_stations:assigned,assigned_station:assigned[0] || null};})});
        }catch(error){res.status(503).json({success:false,message:'Accounts could not be loaded. Please retry.'});}
    });

    router.get('/accounts/pending', ensureSuperAdmin, (req, res) => {
        db.query("SELECT id, username, role, created_at FROM users WHERE is_verified = 0 AND is_active = 0 ORDER BY created_at DESC", (err, results) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, users: results });
        });
    });

    router.put('/accounts/:id/approve', ensureSuperAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        db.query("UPDATE users SET is_verified = 1, is_active = 1 WHERE id = ?", [userId], (err) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'Account accepted successfully.' });
        });
    });

    router.delete('/accounts/:id/decline', ensureSuperAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        if (!Number.isInteger(userId)) {
            return res.status(400).json({ success: false, message: 'Account request is invalid.' });
        }

        db.query(
            "DELETE FROM users WHERE id = ? AND is_verified = 0 AND is_active = 0",
            [userId],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: 'Pending account request not found.' });
                }
                res.json({ success: true, message: 'Account request declined.' });
            }
        );
    });

    router.delete('/accounts/:id', ensureSuperAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const requestingUserId = parseInt(req.user?.id || '0', 10);

        if (userId === requestingUserId) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
        }

        db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Account not found.' });
            }
            res.json({ success: true, message: 'Account permanently deleted.' });
        });
    });

    return router;
};
