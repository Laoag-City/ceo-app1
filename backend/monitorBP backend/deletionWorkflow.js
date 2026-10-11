/**
 * MAINTAINER GUIDE
 * Whole-project deletion approval workflow for both registries.
 * Submitting a request keeps the project intact. Review decides whether to remove it; inspection-only deletion is handled separately.
 * Actor database lookup checks active/verified role consistency, but caller-provided identity headers still need future session hardening.
 */
// Deletion uses the existing change-request queues. No record is removed on submission.
module.exports = function createDeletionWorkflow(db) {
    const query = (sql, values) => new Promise((resolve, reject) => db.query(sql, values, (err, result) => err ? reject(err) : resolve(result)));
    const configs = {
        permits: { records: 'permits', requests: 'permit_change_requests', key: 'permit_id' },
        occupancy: { records: 'occupancy_permits', requests: 'occupancy_change_requests', key: 'occupancy_id' }
    };
    async function actor(req, roles) {
        const id = Number(req.user?.id);
        if (!Number.isSafeInteger(id) || id <= 0) return null;
        const rows = await query('SELECT id, role FROM users WHERE id = ? AND is_active = 1 AND is_verified = 1', [id]);
        return rows[0] && roles.includes(rows[0].role) && rows[0].role === (req.user?.role || '').toLowerCase() ? rows[0] : null;
    }
    function submit(kind) {
        const c = configs[kind];
        return async (req, res) => {
            try {
                const user = await actor(req, ['operator', 'admin', 'superadmin']);
                if (!user) return res.status(403).json({ success: false, message: 'An active authorized account is required.' });
                const id = Number(req.params.id);
                if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid permit ID.' });
                const rows = await query(`SELECT id FROM ${c.records} WHERE id = ?`, [id]);
                if (!rows.length) return res.status(404).json({ success: false, message: 'Permit record not found.' });
                // One SQL statement checks for an existing pending request and inserts if absent.
                const result = await query(`INSERT INTO ${c.requests} (${c.key}, requested_by, change_type, changes, status, remarks)
                    SELECT ?, ?, 'delete', ?, 'pending', ? FROM DUAL WHERE NOT EXISTS
                    (SELECT 1 FROM ${c.requests} WHERE ${c.key} = ? AND change_type = 'delete' AND status = 'pending')`,
                    [id, user.id, JSON.stringify({ recordId: id }), 'Deletion requested. Approval permanently removes this permit and its related records.', id]);
                return res.json({ success: true, pending: true, duplicate: !result.affectedRows, message: result.affectedRows ? 'Deletion request submitted for administrator approval. The record remains available until approved.' : 'A deletion request is already awaiting administrator approval.' });
            } catch (err) {
                return res.status(500).json({ success: false, message: 'Unable to submit the deletion request.' });
            }
        };
    }
    function review(kind, decision) {
        const c = configs[kind];
        return async (req, res, next) => {
            try {
                const requestId = Number(req.params.id);
                if (!Number.isSafeInteger(requestId) || requestId <= 0) return res.status(400).json({ success: false, message: 'Invalid request ID.' });
                const rows = await query(`SELECT * FROM ${c.requests} WHERE id = ?`, [requestId]);
                if (!rows.length) return res.status(404).json({ success: false, message: 'Request no longer exists.' });
                const request = rows[0];
                if (request.change_type !== 'delete') return next();
                const user = await actor(req, ['admin', 'superadmin']);
                if (!user) return res.status(403).json({ success: false, message: 'Only administrators can review deletion requests.' });
                if (request.status !== 'pending') return res.status(409).json({ success: false, message: 'This request has already been reviewed.' });
                let result;
                if (decision === 'approve') {
                    // Atomic conditional delete prevents a declined request from being applied.
                    // Existing foreign keys cascade related records and their obsolete requests.
                    result = await query(`DELETE p FROM ${c.records} p INNER JOIN ${c.requests} r ON r.${c.key} = p.id WHERE r.id = ? AND r.change_type = 'delete' AND r.status = 'pending'`, [requestId]);
                } else {
                    result = await query(`UPDATE ${c.requests} SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), remarks = ? WHERE id = ? AND status = 'pending'`, [String(user.id), 'Deletion declined by administrator. Permit retained.', requestId]);
                }
                if (!result.affectedRows) return res.status(409).json({ success: false, message: 'Request was already processed or the record no longer exists.' });
                return res.json({ success: true, message: decision === 'approve' ? 'Deletion approved. Permit and related records deleted.' : 'Deletion declined. The permit has been retained.' });
            } catch (err) {
                return res.status(500).json({ success: false, message: 'Unable to review the deletion request.' });
            }
        };
    }
    return { submit, review };
};
