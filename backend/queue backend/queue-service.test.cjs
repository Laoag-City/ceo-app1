const {test} = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const {createQueueService, ensureQueueSchema} = require('./queue-service');
const {ensureReportColumns} = require('./queue-reports');

test('window isolation, A/B hold flow, recall, completion and stale actions', async () => {
    const conn = await mysql.createConnection({host:'localhost', user:'root', database:'queue_system'});
    const lockName = 'queue-service-test:' + process.pid;
    const adapter = {getConnection: async () => ({query:conn.query.bind(conn), beginTransaction:conn.beginTransaction.bind(conn), commit:conn.commit.bind(conn), rollback:conn.rollback.bind(conn), release(){}})};
    try {
        // Shadows the real table on this connection; no application records are touched.
        await conn.query("CREATE TEMPORARY TABLE tickets (id INT PRIMARY KEY, name VARCHAR(100), reason TEXT, status ENUM('waiting','holding','serving','dropped') DEFAULT 'waiting', called_by VARCHAR(50), recall_stamp BIGINT) ENGINE=InnoDB");
        await ensureQueueSchema(conn);
        await ensureQueueSchema(conn); // migration is repeatable
        await ensureReportColumns(conn, 'tickets');
        await conn.query("INSERT INTO tickets (id,name,reason) VALUES (1,'A','Releasing Bldg. Permit'),(2,'B','Releasing Bldg. Permit'),(3,'C','Releasing Bldg. Occupancy')");
        const act = createQueueService(adapter, lockName);
        assert.equal((await act('call-next',{workspace:'PC1',source:'queue'})).id,1);
        assert.equal((await act('call-next',{workspace:'PC2',source:'queue'})).id,3);
        await assert.rejects(act('call-next',{workspace:'PC1',source:'queue'}), /Complete or hold/);
        await assert.rejects(act('hold',{workspace:'PC2',ticketId:'TKT-1'}), /current ticket changed/);
        const before = (await conn.query('SELECT recall_stamp FROM tickets WHERE id=1'))[0][0].recall_stamp;
        const recalled = await act('recall',{workspace:'PC1',ticketId:'TKT-1'});
        assert.ok(Number(recalled.recall_stamp) > Number(before));
        await act('hold',{workspace:'PC1',ticketId:'TKT-1'});
        assert.equal((await act('call-next',{workspace:'PC1',source:'queue'})).id,2);
        await assert.rejects(act('call-next',{workspace:'PC1',source:'onHold'}), /Complete or hold/);
        await assert.rejects(act('complete',{workspace:'PC1',ticketId:'TKT-1'}), /current ticket changed/);
        assert.equal((await conn.query('SELECT status FROM tickets WHERE id=2'))[0][0].status,'serving');
        await act('complete',{workspace:'PC1',ticketId:'TKT-2'});
        await assert.rejects(act('complete',{workspace:'PC1',ticketId:'TKT-2'}), /current ticket changed/);
        assert.equal((await act('call-next',{workspace:'PC1',source:'onHold'})).id,1);
        assert.deepEqual((await conn.query('SELECT status FROM tickets ORDER BY id'))[0].map(t=>t.status),['serving','completed','serving']);
        await assert.rejects(act('call-next',{workspace:'Kiosk',source:'queue'}), /valid clerk window/);
        await act('complete',{workspace:'PC1',ticketId:'TKT-1'});
        await assert.rejects(act('call-next',{workspace:'PC1',source:'queue',allowedTasks:['Releasing Bldg. Occupancy']}), /No waiting tickets/);

        // A competing connection holds the same lock: the service must wait.
        const other = await mysql.createConnection({host:'localhost',user:'root',database:'queue_system'});
        try {
            await other.query('SELECT GET_LOCK(?, 1)',[lockName]);
            let done = false;
            const pending = act('recall',{workspace:'PC2',ticketId:'TKT-3'}).then(result => {done=true;return result;});
            await new Promise(resolve=>setTimeout(resolve,100));
            assert.equal(done,false);
            await other.query('SELECT RELEASE_LOCK(?)',[lockName]);
            assert.equal((await pending).id,3);
        } finally { await other.end(); }
    } finally { await conn.end(); }
});
