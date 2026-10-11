/** Staff-only search over current tickets and snapshots retained by queue reset.
 * Ticket numbers can repeat after reset; historyId identifies a specific visit.
 */
const fields = 'name,phone,barangay,reason,status,created_at,called_by';
const {reportFields} = require('./queue-reports');

function positiveInteger(value, fallback, maximum) {
    if (value === undefined || value === '') return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
        throw Object.assign(new Error('Choose a valid history page.'), {status: 400});
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > maximum) {
        throw Object.assign(new Error('Choose a valid history page.'), {status: 400});
    }
    return number;
}

function historySearch(query = {}, dialect) {
    const search = query.q === undefined ? '' : query.q;
    if (typeof search !== 'string' || search.length > 200) {
        throw Object.assign(new Error('Use a search of 200 characters or fewer.'), {status: 400});
    }
    const page = positiveInteger(query.page, 1, 1000000);
    const pageSize = positiveInteger(query.pageSize, 20, 100);
    const term = search.trim();
    const args = [];
    let where = '';
    if (term) {
        // ! is an explicit escape character on both engines; % and _ are literal.
        const pattern = '%' + term.replace(/[!%_]/g, character => '!' + character) + '%';
        const ticket = dialect === 'postgres' ? "CONCAT('TKT-',CAST(id AS TEXT))" : "CONCAT('TKT-',CAST(id AS CHAR))";
        const expressions = [ticket, "COALESCE(name,'')", "COALESCE(phone,'')", "COALESCE(barangay,'')"];
        where = ' WHERE (' + expressions.map(expression => {
            args.push(pattern);
            // app_ci folds Unicode case; C on the results makes LIKE deterministic
            // without losing accented-name matching (Ñ/ñ, É/é).
            return dialect === 'postgres'
                ? `LOWER(${expression} COLLATE public.app_ci) COLLATE "C" LIKE LOWER(? COLLATE public.app_ci) COLLATE "C" ESCAPE '!'`
                : `LOWER(${expression}) LIKE LOWER(?) ESCAPE '!'`;
        }).join(' OR ') + ')';
    }
    const union = `(SELECT id,${fields},0 AS archive_id FROM tickets
        UNION ALL SELECT ticket_id AS id,${fields},id AS archive_id FROM queue_client_history_archive) client_history`;
    return {page, pageSize, args, from: ' FROM ' + union + where};
}

function createClientHistory(db) {
    return async function readHistory(query) {
        const search = historySearch(query, db.dialect);
        const [[count]] = await db.query('SELECT COUNT(*) AS total' + search.from, search.args);
        const total = Number(count.total);
        const totalPages = Math.ceil(total / search.pageSize);
        const page = Math.min(search.page, Math.max(totalPages, 1));
        const [rows] = await db.query(`SELECT id,${fields},archive_id${search.from}
            ORDER BY created_at DESC,id DESC,archive_id DESC LIMIT ? OFFSET ?`,
        [...search.args, search.pageSize, (page - 1) * search.pageSize]);
        return {
            success: true,
            rows: rows.map(row => ({
                id: row.id,
                ticketId: 'TKT-' + row.id,
                historyId: Number(row.archive_id) ? 'archive-' + row.archive_id : 'ticket-' + row.id,
                name: row.name,
                phone: row.phone,
                barangay: row.barangay,
                reason: row.reason,
                status: row.status,
                created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
                called_by: row.called_by
            })),
            pagination: {page, pageSize: search.pageSize, total, totalPages}
        };
    };
}

function registerClientHistory(app, db, sessions) {
    const readHistory = createClientHistory(db);
    app.get('/api/client-history', sessions.requireRoles('operator','admin','superadmin'), async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            res.json(await readHistory(req.query));
        } catch (error) {
            if (!error.status) console.error('Client history failed:', error.code || error.message);
            res.status(error.status || 503).json({success:false, message: error.status ? error.message : 'Client history is unavailable. Please try again.'});
        }
    });
}

async function ensureClientHistorySchema(db) {
    if (db.dialect === 'postgres') {
        // The owner migration creates this table. The runtime role only validates it.
        await db.query('SELECT id,ticket_id,' + fields + ' FROM queue_client_history_archive LIMIT 0');
    } else {
        await db.query(`CREATE TABLE IF NOT EXISTS queue_client_history_archive (
            id BIGINT AUTO_INCREMENT PRIMARY KEY, ticket_id BIGINT NOT NULL,
            name VARCHAR(255) NOT NULL, phone VARCHAR(50) NULL, barangay VARCHAR(255) NOT NULL,
            reason TEXT NOT NULL, status VARCHAR(20) NULL, created_at TIMESTAMP NOT NULL,
            called_by VARCHAR(50) NULL, archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX client_history_created (created_at,ticket_id)
        ) ENGINE=InnoDB`);
    }
}

async function resetQueueWithHistory(db) {
    if (db.dialect === 'postgres') {
        await db.query('SELECT public.reset_office_queue()');
        return {numberingReset:true};
    }
    const conn = await db.getConnection();
    let locked = false;
    try {
        const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS acquired', ['queue_system:service-transitions']);
        if (Number(lock.acquired) !== 1) throw new Error('Queue is busy.');
        locked = true;
        await conn.beginTransaction();
        // Lock rows and the insertion range before copying. A failed archive insert
        // rolls back the reset, rather than losing the previous clients.
        await conn.query('SELECT id FROM tickets ORDER BY id FOR UPDATE');
        await conn.query('UPDATE tickets SET report_visit_id=UUID() WHERE report_visit_id IS NULL');
        await conn.query(`INSERT INTO queue_client_history_archive (ticket_id,${fields},${reportFields}) SELECT id,${fields},${reportFields} FROM tickets`);
        await conn.query('UPDATE ticket_submission_keys SET ticket_id=NULL');
        await conn.query('DELETE FROM tickets');
        await conn.query('DELETE FROM active_workstations');
        await conn.commit();
        // MySQL sequence DDL is outside the committed archive transaction. If it
        // fails, the queue is already safely cleared: report success so in-memory
        // workstation claims are cleared too, and leave existing numbering intact.
        try {
            await conn.query('ALTER TABLE tickets AUTO_INCREMENT = 1001');
        } catch (error) {
            console.error('Queue reset committed; ticket numbering could not restart:', error.code || error.message);
            return {numberingReset:false};
        }
        return {numberingReset:true};
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        try { if (locked) await conn.query('SELECT RELEASE_LOCK(?)', ['queue_system:service-transitions']); }
        finally { conn.release(); }
    }
}

module.exports = {historySearch, createClientHistory, registerClientHistory, ensureClientHistorySchema, resetQueueWithHistory};
