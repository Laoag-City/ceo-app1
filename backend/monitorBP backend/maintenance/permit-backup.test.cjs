const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const backup = require('./permit-backup');

test('backup paths reject traversal and public frontend storage', () => {
    assert.throws(() => backup.backupDirectory(os.tmpdir(), '../permit_system'), /backup ID/);
    assert.throws(() => backup.assertPrivateDirectory(path.resolve(__dirname, '../../../frontend/monitorBP frontend/assets')), /public frontend/);
});

test('real MySQL backup and isolated recovery preserve all values and detect corruption', async t => {
    const config = backup.settings();
    const database = 'permit_backup_fixture_' + crypto.randomBytes(6).toString('hex');
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'permit-backup-test-'));
    const admin = await mysql.createConnection({ ...config.connection, database: undefined });
    let created = false;
    const quote = name => '`' + name + '`';
    t.after(async () => {
        if (created && /^permit_backup_fixture_[a-f0-9]{12}$/.test(database)) await admin.query('DROP DATABASE ' + quote(database));
        await admin.end();
        for (const entry of await fs.readdir(output, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^permit-backup-[A-Za-z0-9-]+$/.test(entry.name)) continue;
            const dir = path.join(output, entry.name);
            for (const name of ['database.sql', 'manifest.json', 'verification.json']) await fs.unlink(path.join(dir, name)).catch(e => { if (e.code !== 'ENOENT') throw e; });
            await fs.rmdir(dir);
        }
        await fs.rmdir(output);
    });
    await admin.query('CREATE DATABASE ' + quote(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    created = true;
    await admin.query('USE ' + quote(database));
    await admin.query('CREATE TABLE parents (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, title TEXT, filed DATE, applied DATE, amount DECIMAL(20,4), content BLOB, history LONGTEXT, created_at TIMESTAMP NULL) ENGINE=InnoDB');
    await admin.query('CREATE TABLE children (id INT PRIMARY KEY, parent_id BIGINT UNSIGNED NULL, remarks TEXT, FOREIGN KEY(parent_id) REFERENCES parents(id)) ENGINE=InnoDB');
    await admin.query('CREATE TABLE empty_table (id INT PRIMARY KEY) ENGINE=InnoDB');
    // Names that sort differently under SQL collations and JavaScript must not look like schema changes.
    await admin.query('CREATE TABLE permit_requests (id INT PRIMARY KEY) ENGINE=InnoDB');
    await admin.query('CREATE TABLE permits (id INT PRIMARY KEY) ENGINE=InnoDB');
    await admin.query('INSERT INTO parents VALUES (?,?,?,?,?,?,?,?)', ['9007199254740993', "Sample O'Brien — café 🏠\nSecond line", '2026-09-09', '2024-02-29', '1234567890123456.1234', Buffer.from([0, 255, 39, 10, 92]), JSON.stringify({ state: 'rejected', remarks: 'Sample only', changes: ['a', 'b'] }), '2026-09-09 12:30:00']);
    await admin.query('INSERT INTO children VALUES (1,?,?), (2,NULL,?)', ['9007199254740993', 'Review pending', 'Unassigned']);
    const fixture = { ...config, output, connection: { ...config.connection, database } };
    const made = await backup.createBackup(fixture);
    assert.equal(made.tables, 5);
    assert.equal(made.rows, 3);
    assert.equal((await backup.listBackups(fixture))[0].recovery, 'not tested');
    const verified = await backup.verifyBackup(fixture, made.id);
    assert.equal(verified.status, 'passed');
    assert.equal(verified.cleanup, true);
    assert.equal(verified.checks.length, 5);
    assert.equal(verified.relationships[0].missing, 0);
    assert.equal((await backup.listBackups(fixture))[0].recovery, 'passed');
    const [[source]] = await admin.query('SELECT CAST(id AS CHAR) id, CAST(filed AS CHAR) filed, CAST(amount AS CHAR) amount, HEX(content) content FROM parents');
    assert.deepEqual(source, { id: '9007199254740993', filed: '2026-09-09', amount: '1234567890123456.1234', content: '00FF270A5C' });
    const [scratch] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [verified.testDatabase]);
    assert.equal(scratch.length, 0);
    await fs.appendFile(path.join(made.directory, 'database.sql'), '\n-- altered after backup\n');
    await assert.rejects(backup.verifyBackup(fixture, made.id), /checksum mismatch/);
    assert.equal((await backup.listBackups(fixture))[0].backup, 'corrupt');
    assert.equal((await backup.listBackups(fixture))[0].recovery, 'failed');

    await admin.query('SET FOREIGN_KEY_CHECKS=0');
    await admin.query("INSERT INTO children VALUES (3,999,'Broken relation in disposable fixture')");
    await admin.query('SET FOREIGN_KEY_CHECKS=1');
    const orphan = await backup.createBackup(fixture);
    await assert.rejects(backup.verifyBackup(fixture, orphan.id), /relationships do not match/);
    const report = JSON.parse(await fs.readFile(path.join(orphan.directory, 'verification.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.cleanup, true);
    assert.equal(report.relationships[0].missing, 1);
    await fs.writeFile(path.join(output, '.maintenance.lock'), 'test');
    await assert.rejects(backup.createBackup(fixture), /already running/);
    await fs.unlink(path.join(output, '.maintenance.lock'));
});
