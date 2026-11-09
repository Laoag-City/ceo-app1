/**
 * MAINTAINER GUIDE
 * Per-project remarks and audit records exposed to workspace panels.
 * Read and comment routes are separate from the middleware that records successful project mutations. Preserve actor, target, and before/after context when extending audit coverage.
 */
const changes = require('./projectChanges');
const kinds = {
    permits: { table: 'permits', requests: 'permit_change_requests', key: 'permit_id' },
    occupancy: { table: 'occupancy_permits', requests: 'occupancy_change_requests', key: 'occupancy_id' }
};
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = function projectRecords(db) {
    const query = async (sql, args = []) => (await db.promise().query(sql, args))[0];
    let ready;
    function initialize() {
        if (!ready) ready = query(`CREATE TABLE IF NOT EXISTS project_records (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            kind VARCHAR(16) NOT NULL, project_id INT NULL, project_title VARCHAR(255) NOT NULL,
            actor_id INT NOT NULL, actor_name VARCHAR(100) NOT NULL, actor_role VARCHAR(20) NOT NULL,
            category VARCHAR(16) NOT NULL, outcome VARCHAR(20) NOT NULL,
            message TEXT NOT NULL, details MEDIUMTEXT NULL,
            request_key VARCHAR(100) NULL UNIQUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX project_feed (kind, project_id, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => { ready = null; throw error; });
        return ready;
    }
    async function actor(req) {
        const id = Number(req.user?.id);
        if (!Number.isSafeInteger(id) || id < 1) throw bad('Please sign in again.', 403);
        const rows = await query(`SELECT u.id,u.username,u.role,COALESCE(NULLIF(TRIM(p.display_name),''),u.username) AS display_name
            FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id WHERE u.id=? AND u.is_active=1 AND u.is_verified=1`, [id]);
        const user = rows[0];
        if (!user || !['operator', 'admin', 'superadmin'].includes(user.role) || user.role !== req.user?.role) throw bad('Your account cannot access project records.', 403);
        return user;
    }
    async function target(kind, id) {
        if (!kinds[kind] || !Number.isSafeInteger(id) || id < 1) throw bad('Invalid project.');
        const rows = await query(`SELECT project_title FROM ${kinds[kind].table} WHERE id=?`, [id]);
        if (!rows.length) throw bad('This project no longer exists.', 404);
        return rows[0].project_title;
    }
    function fail(res, error) {
        return res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'Project records are unavailable. Please try again.' });
    }
    function routes(app) {
        app.get('/api/project-records/:kind/:id', async (req, res) => {
            try {
                await initialize(); await actor(req);
                const kind = req.params.kind, id = Number(req.params.id);
                await target(kind, id);
                const before = req.query.before ? Number(req.query.before) : Number.MAX_SAFE_INTEGER;
                if (!Number.isSafeInteger(before) || before < 1) throw bad('Invalid history cursor.');
                const category = req.query.category || null;
                if(category && !['activity','comment'].includes(category)) throw bad('Invalid record category.');
                const rows = await query(`SELECT r.id,COALESCE(NULLIF(TRIM(p.display_name),''),r.actor_name) AS actor_name,r.actor_role,r.category,r.outcome,r.message,r.details,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
                    FROM project_records r LEFT JOIN permit_user_profiles p ON p.user_id=r.actor_id
                    WHERE r.kind=? AND r.project_id=? AND r.outcome <> 'failed' AND r.id < ? AND (? IS NULL OR r.category=?) ORDER BY r.id DESC LIMIT 11`, [kind, id, before, category, category]);
                const more = rows.length > 10; if (more) rows.pop();
                res.json({ success: true, records: rows, next: more ? rows[rows.length - 1].id : null });
            } catch (error) { fail(res, error); }
        });
        app.post('/api/project-records/:kind/:id/comments', async (req, res) => {
            try {
                await initialize(); const user = await actor(req);
                const kind = req.params.kind, id = Number(req.params.id);
                const title = await target(kind, id);
                const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
                if (!message || message.length > 2000) throw bad('Enter a comment of 1–2,000 characters.');
                if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(req.body.requestId || '')) throw bad('Invalid comment request. Refresh and try again.');
                const key = `${user.id}:${req.body.requestId}`;
                await query(`INSERT INTO project_records (kind,project_id,project_title,actor_id,actor_name,actor_role,category,outcome,message,request_key)
                    VALUES (?,?,?,?,?,?,'comment','saved',?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [kind,id,title,user.id,user.display_name,user.role,message,key]);
                const rows = await query('SELECT kind,project_id,message FROM project_records WHERE request_key=?', [key]);
                if (rows[0].kind !== kind || rows[0].project_id !== id || rows[0].message !== message) throw bad('This submission was already used for a different comment. Refresh before posting another.', 409);
                res.json({ success: true });
            } catch (error) { fail(res, error); }
        });
    }
    // Save an intent before a legacy mutation. Only confirmed successful responses are
    // labelled saved; a process interruption remains explicitly unconfirmed in history.
    // Observe supported mutation responses to record successful changes with their actor.
    // Keep audit recording distinct from user-authored remarks and approval decisions.
    async function audit(req, res, next) {
        if (!['POST','PUT','DELETE'].includes(req.method)) return next();
        const path = req.path;
        if (!/^\/api\/(permits(?:\/|$)|occupancy(?:\/|$)|matrix\/)/.test(path)) return next();
        try {
            await initialize(); const user = await actor(req);
            const kind = path.startsWith('/api/occupancy') ? 'occupancy' : 'permits';
            const c = kinds[kind]; const body = req.body || {};
            let id, title, action, detail = '';
            const review = path.match(/\/change-requests\/(\d+)\/(approve|reject)$/);
            if (review) {
                const rows = await query(`SELECT * FROM ${c.requests} WHERE id=?`, [review[1]]);
                if (!rows.length) return next();
                id = rows[0][c.key];
                let submitted=rows[0].changes;
                try { if(typeof submitted==='string')submitted=JSON.parse(submitted); } catch (_) { submitted=null; }
                if(submitted?._before) detail=JSON.stringify({version:1,changes:changes.fromSnapshot(submitted._before,submitted)});
                action = `${review[2] === 'approve' ? 'Approved' : 'Declined'} ${rows[0].change_type === 'delete' ? 'project deletion' : rows[0].change_type === 'inspection_delete' ? 'inspection deletion' : 'edit request'} #${review[1]}`;
                // Preserve the filing metadata before an operator's approved
                // deletion cascades the parent row. Only a saved audit outcome
                // is reportable; blocked/failed/unconfirmed attempts stay excluded.
                if(review[2]==='approve' && rows[0].change_type==='delete') {
                    const records=await query(`SELECT * FROM ${c.table} WHERE id=?`,[id]);
                    if(records[0])detail=JSON.stringify({version:1,changes:[{field:'Permit record',before:records[0].project_title,after:'Deleted with related records'}],deletion:{mode:'approved_request',project:{record:records[0]}}});
                }
            } else if (/\/matrix\/(add|remove)$/.test(path)) {
                id = Number(body[c.key] || req.query[c.key]);
                const sub = Number(body.sub_permit_id || req.query.sub_permit_id);
                if (kind === 'permits' && sub) {
                    const rows = await query('SELECT permit_id FROM sub_permits WHERE id=?', [sub]);
                    id = rows[0]?.permit_id;
                }
                action = path.endsWith('/add') ? 'Added station' : 'Removed station';
                detail = String(body.discipline_name || req.query.discipline_name || '').slice(0,200);
                if (sub) detail += ` (sub-permit #${sub})`;
            } else {
                const match = path.match(/^\/api\/(?:permits|occupancy)(?:\/(\d+))?(.*)$/);
                if (!match) return next();
                id = match[1] ? Number(match[1]) : null;
                const suffix = match[2];
                action = !id ? 'Created project' : suffix === '/stations/initialize' ? 'Added standard routing stations' : suffix === '/final-review' ? (body.decision==='approved'?'Gave final project approval':'Returned project for correction') : suffix.includes('inspections') ? `${req.method === 'POST' ? 'Added' : req.method === 'DELETE' ? 'Deleted' : 'Edited'} inspection` : suffix === '/station-dates' ? 'Updated station dates' : suffix === '/checklist' ? 'Updated requirements checklist' : suffix === '/signatures' ? 'Updated routing matrix' : req.method === 'DELETE' ? 'Requested project deletion' : 'Edited project details';
                if (suffix.includes('inspections')) detail = [body.inspection_type,body.inspection_date,body.result, suffix.match(/\d+$/)?.[0] ? `Inspection #${suffix.match(/\d+$/)[0]}` : ''].filter(Boolean).join(' · ');
            }
            title = id ? await target(kind, id) : String(body.project_title || 'New project').slice(0,255);
            if(!review) {
                const diff=await changes.capture(query,kind,id,path,body);
                if(!diff.length && /\/(signatures|station-dates)$/.test(path))return next();
                if(diff.length) detail=JSON.stringify({version:1,changes:diff});
            }
            const event = await query(`INSERT INTO project_records (kind,project_id,project_title,actor_id,actor_name,actor_role,category,outcome,message,details) VALUES (?,?,?,?,?,?,'activity','unconfirmed',?,?)`, [kind,id || null,title,user.id,user.display_name,user.role,action,detail]);
            const original = res.json.bind(res);
            res.json = function (result) {
                res.json = original;
                if(result?.unchanged){query('DELETE FROM project_records WHERE id=?',[event.insertId]).then(()=>original(result)).catch(()=>original(result));return res;}
                const success = res.statusCode < 400 && result?.success === true && !result.duplicate;
                const message = success && result.pending ? `Submitted for administrator approval: ${action.replace(/^Deleted inspection/, 'Inspection deletion').replace(/^Updated /, '').replace(/^Edited /, '').replace(/^Requested /, '')}` : result?.conflict ? `${action} — blocked because the request was outdated` : action;
                let confirmedDetail=res.locals.projectChangeDetail || detail;
                if(success && res.locals.duplicateAcknowledgement) {
                    let parsed;try{parsed=JSON.parse(confirmedDetail);}catch{}
                    const warning=res.locals.duplicateAcknowledgement;
                    confirmedDetail=JSON.stringify({version:1,changes:[...(parsed?.version===1&&Array.isArray(parsed.changes)?parsed.changes:[]),{field:'Possible duplicates',before:warning.references.join(', ')+(warning.total>warning.references.length?' and other matches':''),after:'Reviewed and acknowledged before saving'}]});
                }
                query('UPDATE project_records SET project_id=COALESCE(?,project_id), outcome=?, message=?, details=? WHERE id=?', [res.locals.projectRecordId || null, success ? 'saved' : result?.conflict ? 'blocked' : 'failed', message, confirmedDetail, event.insertId])
                    .then(() => original(result))
                    .catch(error => { console.error('Activity confirmation failed:', error.message); original({ ...result, activityWarning: 'The action completed but its activity confirmation is unavailable.' }); });
                return res;
            };
            next();
        } catch (error) { fail(res, error); }
    }
    return { routes, audit, initialize };
};
