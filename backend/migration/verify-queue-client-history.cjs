// Read-only integration check. Does not open an HTTP server or change records.
const assert = require('node:assert/strict');
const {createClientHistory, ensureClientHistorySchema, historySearch} = require('../queue backend/client-history');
const db = require('../database').createPool({database:'queue_system'});

(async () => {
    try {
        assert.equal(db.dialect, 'postgres');
        await ensureClientHistorySchema(db);
        const read = createClientHistory(db);
        const first = await read({page:'1', pageSize:'20'});
        assert.equal(first.success, true);
        assert.ok(first.rows.length <= 20);
        assert.equal(new Set(first.rows.map(row => row.historyId)).size, first.rows.length);
        for (const row of first.rows) assert.equal(row.ticketId, 'TKT-' + row.id);

        // Exercise all four searches against real saved values without printing them.
        const sample = first.rows[0];
        if (sample) {
            for (const field of ['ticketId', 'name', 'barangay', 'phone']) {
                const query = String(sample[field] || '').trim().slice(0, 200);
                if (!query) continue;
                const found = await read({q:query, page:'1', pageSize:'100'});
                assert.ok(found.pagination.total >= 1, field + ' search should find saved visits');
                assert.ok(found.rows.every(row => ['ticketId', 'name', 'barangay', 'phone'].some(key => String(row[key] || '').toLowerCase().includes(query.toLowerCase()))));
            }
        }

        // SELECT-only synthetic rows verify Unicode case folding and literal wildcards.
        for (const [term, name, expected] of [['ñé', 'ÑÉ', 1], ['%_!', 'Has %_! literally', 1], ['%_!', 'Has anything', 0]]) {
            const search = historySearch({q:term}, 'postgres');
            const predicate = search.from.slice(search.from.indexOf(' WHERE '));
            const [[row]] = await db.query('SELECT COUNT(*) AS total FROM (SELECT 1 AS id, CAST(? AS TEXT) COLLATE public.app_ci AS name, CAST(? AS TEXT) AS phone, CAST(? AS TEXT) AS barangay) client_history' + predicate, [name, '', '', ...search.args]);
            assert.equal(Number(row.total), expected);
        }
        const [[permissions]] = await db.query("SELECT has_table_privilege(current_user, 'public.queue_client_history_archive', 'SELECT') AS can_read, has_table_privilege(current_user, 'public.queue_client_history_archive', 'DELETE') AS can_delete");
        assert.equal(permissions.can_read, true);
        assert.equal(permissions.can_delete, false);
        console.log('Live PostgreSQL history checks passed: saved-record searches, Unicode case matching, literal wildcards, and archive read permissions. No records changed.');
    } finally {await db.end();}
})().catch(error => {console.error('History verification failed:', error.code || error.message); process.exitCode = 1;});
