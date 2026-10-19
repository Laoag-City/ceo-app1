/** Window-scoped queue transitions. The connection-owned lock serializes callers
 * across server processes; the transaction locks the selected ticket until commit.
 * UI ticket IDs protect against a stale tab acting on a newer customer's ticket.
 */
const {tasks} = require('./queue-services');
const {recordTicketTransition} = require('./queue-reports');
function fail(message, status = 409) { throw Object.assign(new Error(message), {status}); }

async function ensureQueueSchema(db) {
    const [columns] = await db.query("SHOW COLUMNS FROM tickets LIKE 'status'");
    const type = columns[0]?.Type;
    // Append to the existing enum without renumbering or rewriting ticket identities.
    if (type?.startsWith('enum(') && !type.includes("'completed'")) {
        if (type !== "enum('waiting','holding','serving','dropped')") {
            throw new Error('Unexpected ticket status schema; review before migration.');
        }
        await db.query("ALTER TABLE tickets MODIFY status ENUM('waiting','holding','serving','dropped','completed') DEFAULT 'waiting'");
    }
}

function createQueueService(db, lockName = 'queue_system:service-transitions', options = {}) {
    return async function transition(action, input = {}) {
        const {workspace, ticketId, source, currentTicketId, expectedStatus} = input;
        if (!Object.hasOwn(tasks, workspace)) fail('Choose a valid clerk window.', 400);
        if (!['call-next', 'next', 'resume', 'drop', 'recall', 'hold', 'complete'].includes(action)) fail('Unknown queue action.', 400);
        if (action === 'call-next' && !['queue', 'onHold'].includes(source)) fail('Choose a valid queue.', 400);
        if (action === 'resume' && !ticketId) fail('Choose a held ticket.',400);
        for (const id of [ticketId,currentTicketId]) {
            if (id != null && (typeof id !== 'string' || !/^TKT-[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id.slice(4))))) fail('Choose a valid ticket.',400);
        }
        if (expectedStatus != null && !['waiting','holding','serving'].includes(expectedStatus)) fail('Choose a valid ticket status.',400);
        const conn = await db.getConnection();
        let locked = false;
        try {
            if(conn.dialect==='postgres') {
                await conn.beginTransaction();
                await conn.query('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[lockName]);
            } else {
            const [[result]] = await conn.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
            if (Number(result.acquired) !== 1) fail('Queue is busy. Please try again.');
            locked = true;
            await conn.beginTransaction();
            }
            const [active] = await conn.query("SELECT * FROM tickets WHERE status = 'serving' AND called_by = ? FOR UPDATE", [workspace]);
            if (active.length > 1) fail('This window has more than one active ticket. Ask an administrator to review it.');
            const changedAt = options.now ? new Date(options.now()) : new Date();
            let ticket;
            let completedTicket = null;
            if (action === 'next' || action === 'resume') {
                const expected = action === 'next' ? ticketId : currentTicketId;
                if ((active[0] ? `TKT-${active[0].id}` : null) !== (expected ?? null)) fail('Your current ticket changed. Refresh and try again.');
                const [rows] = action === 'resume'
                    ? await conn.query("SELECT * FROM tickets WHERE id = ? AND status = 'holding' AND reason IN (?) FOR UPDATE", [ticketId?.slice(4),tasks[workspace]])
                    : await conn.query('SELECT * FROM tickets WHERE status = ? AND reason IN (?) ORDER BY id ASC LIMIT 1 FOR UPDATE', ['waiting',tasks[workspace]]);
                if (action === 'resume' && !rows.length) fail('That held ticket changed or belongs to another window. Refresh and try again.');
                if (!active.length && !rows.length) fail('No waiting tickets match this window.');
                if (active[0]) {
                    await recordTicketTransition(conn, active[0], 'completed', changedAt);
                    await conn.query("UPDATE tickets SET status = 'completed' WHERE id = ?", [active[0].id]);
                    completedTicket = {...active[0],status:'completed'};
                }
                ticket = rows[0] || null;
                if (ticket) {
                    await recordTicketTransition(conn, ticket, 'serving', changedAt);
                    await conn.query("UPDATE tickets SET status = 'serving', called_by = ?, recall_stamp = ? WHERE id = ?", [workspace,Date.now(),ticket.id]);
                }
            } else if (action === 'drop') {
                if (!ticketId) fail('Choose a valid ticket.',400);
                // A ticket already being served stays with its recorded window
                // even when that window's service assignments change.
                const target = active.find(row => `TKT-${row.id}` === ticketId) ||
                    (await conn.query('SELECT * FROM tickets WHERE id = ? AND reason IN (?) FOR UPDATE',[ticketId.slice(4),tasks[workspace]]))[0][0];
                if (!target || !['waiting','holding','serving'].includes(target.status) ||
                    (expectedStatus && target.status !== expectedStatus) ||
                    (target.status === 'serving' && target.called_by !== workspace)) fail('That ticket changed or belongs to another window. Refresh and try again.');
                ticket = target;
                await recordTicketTransition(conn, ticket, 'dropped', changedAt);
                await conn.query("UPDATE tickets SET status = 'dropped' WHERE id = ?",[ticket.id]);
            } else if (action === 'call-next') {
                if (active.length) fail('Complete or hold your current ticket before calling another.');
                const [rows] = await conn.query('SELECT * FROM tickets WHERE status = ? AND reason IN (?) ORDER BY id ASC LIMIT 1 FOR UPDATE', [source === 'onHold' ? 'holding' : 'waiting', tasks[workspace]]);
                if (!rows.length) fail(source === 'onHold' ? 'No held tickets match this window.' : 'No waiting tickets match this window.');
                ticket = rows[0];
                await recordTicketTransition(conn, ticket, 'serving', changedAt);
                await conn.query("UPDATE tickets SET status = 'serving', called_by = ?, recall_stamp = ? WHERE id = ?", [workspace, Date.now(), ticket.id]);
            } else {
                ticket = active.find(row => `TKT-${row.id}` === ticketId);
                if (!ticket) fail('Your current ticket changed. Refresh and try again.');
                if (action === 'recall') {
                    await conn.query('UPDATE tickets SET recall_stamp = ? WHERE id = ?', [Math.max(Date.now(), Number(ticket.recall_stamp || 0) + 1), ticket.id]);
                } else if (action === 'hold') {
                    await recordTicketTransition(conn, ticket, 'holding', changedAt);
                    await conn.query("UPDATE tickets SET status = 'holding', called_by = NULL, recall_stamp = NULL WHERE id = ?", [ticket.id]);
                } else {
                    await recordTicketTransition(conn, ticket, 'completed', changedAt);
                    await conn.query("UPDATE tickets SET status = 'completed' WHERE id = ?", [ticket.id]);
                }
            }
            const updated = ticket ? (await conn.query('SELECT * FROM tickets WHERE id = ?', [ticket.id]))[0][0] : null;
            await conn.commit();
            return action === 'next' || action === 'resume' ? {ticket:updated,completedTicket} : updated;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            try {
                if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
            } finally { conn.release(); }
        }
    };
}
module.exports = {createQueueService, ensureQueueSchema};
