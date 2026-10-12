/** Registry-wide deletion requests live in project_records, without a cascading
 * project foreign key. Submission, review, archive, and deletion are transactional.
 * A request covers only its recorded projects; changed projects require resubmission.
 */
const crypto = require('node:crypto');
const configs = {
    permits: { table: 'permits', key: 'permit_id', matrix: 'permit_routing_matrix', label: 'Building' },
    occupancy: { table: 'occupancy_permits', key: 'occupancy_id', matrix: 'occupancy_routing_matrix', label: 'Occupancy' }
};
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bad = (message, status = 400) => Object.assign(Error(message), { status });
const pendingKey = kind => 'bulk-delete:' + kind + ':pending';
const close = db => typeof db.release === 'function' ? db.release() : db.end();

module.exports = function bulkDeletionWorkflow(open) {
    async function actor(db, req, roles) {
        const id = Number(req.user?.id);
        if (!Number.isSafeInteger(id) || id < 1) throw bad('Please sign in again.', 403);
        const [rows] = await db.query('SELECT id, username, role FROM users WHERE id=? AND is_active=1 AND is_verified=1 FOR UPDATE', [id]);
        const user = rows[0];
        if (!user || !roles.includes(user.role) || user.role !== req.user.role) throw bad('Your account cannot perform this action.', 403);
        return user;
    }
    function run(kind, roles, operation) {
        return async (req, res) => {
            let db, locked = false;
            try {
                if (!configs[kind]) throw bad('Unknown permit type.');
                db = await open();
                await db.beginTransaction();
                const user = await actor(db, req, roles);
                if (db.dialect === 'postgres') await db.query('SELECT pg_advisory_xact_lock(72026, ?)', [kind === 'permits' ? 1 : 2]);
                else {
                    const [rows] = await db.query('SELECT GET_LOCK(?,10) acquired', [pendingKey(kind)]);
                    if (!rows[0].acquired) throw bad('Another deletion request is being processed. Try again shortly.', 409);
                    locked = true;
                }
                const result = await operation(db, user, req);
                await db.commit();
                return res.status(result.status || 200).json(result.body);
            } catch (error) {
                if (db) await db.rollback().catch(() => {});
                return res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'The deletion request could not be completed. No records were deleted.' });
            } finally {
                if (locked) await db.query('SELECT RELEASE_LOCK(?)', [pendingKey(kind)]).catch(() => {});
                if (db) await close(db);
            }
        };
    }
    async function pendingRows(db, kind) {
        const [rows] = await db.query("SELECT * FROM project_records WHERE kind=? AND category='bulk_delete' AND outcome='pending' ORDER BY id DESC", [kind]);
        return rows;
    }
    function present(row) {
        const details = decode(row.details);
        return { id: row.id, kind: row.kind, change_type: 'bulk_delete', bulk: true, status: row.outcome,
            project_title: row.project_title, requested_by_name: row.actor_name, created_at: row.created_at,
            record_count: details.projects.length, changes: { count: details.projects.length, projects: details.projects.map(p => ({ id: p.record.id, project_title: p.record.project_title })) } };
    }
    // Capture complete dependent data in a stable order. Parent locks coordinate
    // with station edits, inspections, checklist saves and final reviews.
    async function snapshot(db, kind, ids) {
        const c = configs[kind];
        const [records] = await db.query('SELECT * FROM ' + c.table + (ids ? ' WHERE id IN (?)' : '') + ' ORDER BY id FOR UPDATE', ids ? [ids] : []);
        if (!records.length) return [];
        const selected = records.map(p => Number(p.id));
        const [matrix] = await db.query('SELECT * FROM ' + c.matrix + ' WHERE ' + c.key + ' IN (?) ORDER BY id FOR UPDATE', [selected]);
        const requestTable = kind === 'permits' ? 'permit_change_requests' : 'occupancy_change_requests';
        const [requests] = await db.query('SELECT * FROM ' + requestTable + ' WHERE ' + c.key + ' IN (?) ORDER BY id FOR UPDATE', [selected]);
        const [reviews] = await db.query('SELECT * FROM permit_final_reviews WHERE kind=? AND project_id IN (?) ORDER BY id', [kind, selected]);
        let lots = [], subs = [], subMatrix = [], inspections = [], checklists = [];
        if (kind === 'permits') {
            [inspections] = await db.query('SELECT * FROM permit_inspections WHERE permit_id IN (?) ORDER BY id FOR UPDATE', [selected]);
            [lots] = await db.query('SELECT * FROM permit_lots WHERE permit_id IN (?) ORDER BY id FOR UPDATE', [selected]);
            [subs] = await db.query('SELECT * FROM sub_permits WHERE permit_id IN (?) ORDER BY id FOR UPDATE', [selected]);
            if (subs.length) [subMatrix] = await db.query('SELECT * FROM permit_routing_matrix WHERE sub_permit_id IN (?) ORDER BY id FOR UPDATE', [subs.map(s => Number(s.id))]);
        } else {
            [inspections] = await db.query('SELECT * FROM occupancy_inspections WHERE occupancy_id IN (?) ORDER BY id FOR UPDATE', [selected]);
            [checklists] = await db.query('SELECT * FROM occupancy_checklists WHERE occupancy_id IN (?) ORDER BY id FOR UPDATE', [selected]);
        }
        return records.map(record => {
            const id = Number(record.id), own = rows => rows.filter(row => Number(row[c.key]) === id);
            const ownSubs = own(subs), subIds = new Set(ownSubs.map(s => Number(s.id)));
            return { record, matrix: own(matrix), requests: own(requests), final_reviews: reviews.filter(r => Number(r.project_id) === id),
                ...(kind === 'permits' ? { lots: own(lots), subs: ownSubs, subMatrix: subMatrix.filter(m => subIds.has(Number(m.sub_permit_id))),
                    // Preserve snapshots of requests submitted before this feature
                    // when their projects still have no building inspections.
                    ...(own(inspections).length ? {inspections:own(inspections)} : {})
                } : { inspections: own(inspections), checklists: own(checklists) }) };
        });
    }
    function status(kind) {
        return run(kind, ['operator', 'admin'], async db => {
            const [records] = await db.query('SELECT id FROM ' + configs[kind].table + ' ORDER BY id');
            const pending = (await pendingRows(db, kind))[0];
            return { body: { success: true, count: records.length, version: hash(records.map(r => Number(r.id))), pending: pending ? present(pending) : null } };
        });
    }
    function submit(kind) {
        return run(kind, ['operator'], async (db, user, req) => {
            if (req.body?.confirmation !== 'DELETE ALL') throw bad('Confirm the deletion request first.');
            const previous = (await pendingRows(db, kind))[0];
            if (previous) return { body: { success: true, pending: true, duplicate: true, request: present(previous), message: 'A request to delete all ' + configs[kind].label.toLowerCase() + ' permit records is already awaiting admin review.' } };
            const projects = await snapshot(db, kind);
            if (!projects.length) throw bad('There are no permit records to delete.');
            if (req.body.version !== hash(projects.map(p => Number(p.record.id)))) throw bad('The registry changed. Refresh the record count and confirm again.', 409);
            const details = { type: 'bulk_delete', projects, snapshot_hash: hash(projects) };
            const [result] = await db.query("INSERT INTO project_records (kind,project_id,project_title,actor_id,actor_name,actor_role,category,outcome,message,details,request_key) VALUES (?,NULL,?,?,?,?,'bulk_delete','pending',?,?,?)",
                [kind, 'All ' + configs[kind].label + ' permit records', user.id, user.username, user.role,
                    'Requested deletion of all ' + projects.length + ' ' + configs[kind].label.toLowerCase() + ' permit records', JSON.stringify(details), pendingKey(kind)]);
            return { body: { success: true, pending: true, requestId: result.insertId, count: projects.length, message: 'Request sent to the admin. All ' + projects.length + ' permit records remain available until approved.' } };
        });
    }
    function review(kind, decision) {
        return run(kind, ['admin'], async (db, user, req) => {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) throw bad('Invalid request ID.');
            const [rows] = await db.query("SELECT * FROM project_records WHERE id=? AND kind=? AND category='bulk_delete' FOR UPDATE", [id, kind]);
            const request = rows[0];
            if (!request) throw bad('Deletion request not found.', 404);
            if (request.outcome !== 'pending') throw bad('This deletion request has already been reviewed.', 409);
            if (!['approve', 'reject'].includes(decision)) throw bad('Invalid review decision.');
            let details; try { details = decode(request.details); } catch (_) {}
            if (!details || typeof details !== 'object') details = { type: 'bulk_delete', projects: [], original_details: request.details };
            const reviewed = { ...details, reviewed_by: user.username, reviewed_at: new Date().toISOString(), decision };
            async function finish(outcome, message) {
                await db.query('UPDATE project_records SET outcome=?,message=?,details=?,request_key=NULL WHERE id=?', [outcome, message, JSON.stringify(reviewed), id]);
            }
            if (decision === 'reject') {
                await finish('rejected', 'Admin declined deletion of all ' + (Array.isArray(details.projects) ? details.projects.length : 0) + ' ' + configs[kind].label.toLowerCase() + ' permit records');
                return { body: { success: true, message: 'Deletion declined. All permit records have been retained.' } };
            }
            if (req.body?.confirmation !== 'DELETE ALL') throw bad('Confirm permanent deletion before approving.');
            if (!Array.isArray(details.projects) || !details.projects.length || details.projects.some(p => !Number.isSafeInteger(Number(p.record?.id)) || Number(p.record.id) < 1) || hash(details.projects) !== details.snapshot_hash) throw bad('The recorded deletion scope is invalid. Decline this request and submit a new one.', 409);
            const ids = details.projects.map(p => Number(p.record.id));
            if (new Set(ids).size !== ids.length) throw bad('Invalid deletion scope.', 409);
            const current = await snapshot(db, kind, ids);
            if (hash(current) !== details.snapshot_hash) {
                reviewed.decision = 'conflict';
                await finish('conflict', 'Bulk deletion blocked: permit records changed after submission');
                return { status: 409, body: { success: false, conflict: true, message: 'Permit records changed after this request. Nothing was deleted. Ask the operator to submit a fresh request.' } };
            }
            for (const project of current) {
                await db.query("INSERT INTO project_records (kind,project_id,project_title,actor_id,actor_name,actor_role,category,outcome,message,details) VALUES (?,?,?,?,?,?,'activity','saved',?,?)",
                    [kind, project.record.id, project.record.project_title, user.id, user.username, user.role,
                        'Deleted permit through bulk deletion request #' + id, JSON.stringify({ version: 1, changes: [{ field: 'Permit record', before: project.record.project_title, after: 'Deleted with related records' }] })]);
            }
            const [deleted] = await db.query('DELETE FROM ' + configs[kind].table + ' WHERE id IN (?)', [ids]);
            if (deleted.affectedRows !== ids.length) throw bad('The registry changed during review. No records were deleted.', 409);
            await finish('approved', 'Admin approved deletion of all ' + ids.length + ' ' + configs[kind].label.toLowerCase() + ' permit records');
            return { body: { success: true, deletedCount: ids.length, message: ids.length + ' ' + configs[kind].label + ' permit records and their related records were deleted. Approval and activity history have been retained.' } };
        });
    }
    async function pending(kind) {
        const db = await open();
        try { return (await pendingRows(db, kind)).map(present); }
        finally { await close(db); }
    }
    return { status, submit, review, pending };
};
