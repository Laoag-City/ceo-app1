/**
 * MAINTAINER GUIDE
 * Local permit backup and recovery maintenance utility.
 * See BACKUP-RECOVERY.md for commands and restore safeguards. These operations are not web routes and should not be exposed as public downloads.
 * Backup verification and a successful restore exercise serve different purposes; preserve both checks.
 */
'use strict';
// Local maintenance commands only. No backup files or restore endpoints are served by Express.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const mysql = require('mysql2/promise');

const ID = /^permit-backup-\d{8}T\d{9}Z-[a-f0-9]{12}$/;
const NAME = /^[A-Za-z0-9_]+$/;
const DUMP_OPTIONS = ['--single-transaction', '--skip-lock-tables', '--quick', '--hex-blob', '--order-by-primary', '--complete-insert', '--skip-extended-insert', '--skip-comments', '--skip-dump-date', '--no-tablespaces', '--default-character-set=utf8mb4'];
const quote = value => { if (!NAME.test(value)) throw Error('Unsupported database or table name.'); return '`' + value + '`'; };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function settings(env = process.env) {
    const bin = env.MYSQL_BIN_DIR || (process.platform === 'win32' ? 'C:\\xampp\\mysql\\bin' : '');
    return {
        connection: { host: env.PERMIT_DB_HOST || 'localhost', port: Number(env.PERMIT_DB_PORT || 3306), user: env.PERMIT_DB_USER || 'root', password: env.PERMIT_DB_PASSWORD || '', database: env.PERMIT_DB_NAME || 'permit_system' },
        output: path.resolve(env.PERMIT_BACKUP_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'PermitManagement', 'Backups')),
        dump: bin ? path.join(bin, process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump') : 'mysqldump',
        client: bin ? path.join(bin, process.platform === 'win32' ? 'mysql.exe' : 'mysql') : 'mysql'
    };
}
function assertPrivateDirectory(output) {
    const frontend = path.resolve(__dirname, '..', '..', '..', 'frontend');
    const relative = path.relative(frontend, path.resolve(output));
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Backups cannot be stored in the public frontend directory.');
}
function backupDirectory(output, id) {
    if (!ID.test(id)) throw Error('Use a backup ID from the list command, not a file path.');
    return path.join(output, id);
}
async function fileHash(file) {
    const digest = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
    return digest.digest('hex');
}
async function jsonWrite(file, value) {
    const temporary = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fsp.rename(temporary, file);
}
async function locked(config, operation) {
    assertPrivateDirectory(config.output);
    await fsp.mkdir(config.output, { recursive: true, mode: 0o700 });
    // Check the resolved destination too, so a junction cannot point into the web root.
    assertPrivateDirectory(await fsp.realpath(config.output));
    const file = path.join(config.output, '.maintenance.lock');
    let handle;
    try { handle = await fsp.open(file, 'wx', 0o600); }
    catch (e) { if (e.code === 'EEXIST') throw Error('A backup or verification is already running. See the recovery guide if a previous run was interrupted.'); throw e; }
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await operation(); }
    finally { await handle.close(); await fsp.unlink(file); }
}
async function inventory(db, database) {
    quote(database);
    const [tables] = await db.query('SELECT TABLE_NAME name, TABLE_TYPE type, ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [database]);
    const [objects] = await db.query("SELECT TRIGGER_NAME name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? UNION ALL SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? UNION ALL SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?", [database, database, database]);
    const [external] = await db.query('SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_SCHEMA IS NOT NULL AND REFERENCED_TABLE_SCHEMA<>?', [database, database]);
    const [keys] = await db.query("SELECT DISTINCT TABLE_NAME name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND INDEX_NAME='PRIMARY'", [database]);
    const primary = new Set(keys.map(k => k.name));
    if (!tables.length) throw Error('The source database has no tables.');
    if (objects.length || external.length || tables.some(t => t.type !== 'BASE TABLE' || t.engine !== 'InnoDB' || !primary.has(t.name) || !NAME.test(t.name))) {
        throw Error('This backup version supports InnoDB tables with primary keys and internal foreign keys only. Views, triggers, routines and events require a reviewed backup upgrade.');
    }
    // Database collations may ignore underscores; use the same ordering as the dump summary.
    return tables.map(t => t.name).sort();
}
function connectionArgs(connection) {
    return ['--protocol=TCP', '--host=' + connection.host, '--port=' + connection.port, '--user=' + connection.user];
}
async function runClient(tool, args, connection, file, restore = false) {
    const child = spawn(tool, ['--no-defaults', ...connectionArgs(connection), ...args, connection.database], {
        windowsHide: true, env: { ...process.env, MYSQL_PWD: connection.password }, stdio: [restore ? 'pipe' : 'ignore', restore ? 'ignore' : 'pipe', 'pipe']
    });
    let diagnostic = '';
    child.stderr.on('data', data => { if (diagnostic.length < 4000) diagnostic += data.toString(); });
    const completed = new Promise((resolve, reject) => {
        child.on('error', () => reject(Error('Cannot start the MySQL utility. Check MYSQL_BIN_DIR and database connectivity.')));
        child.on('close', code => code === 0 ? resolve() : reject(Error('MySQL utility failed' + (diagnostic.match(/ERROR\s+\d+/i)?.[0] ? ' (' + diagnostic.match(/ERROR\s+\d+/i)[0] + ')' : '') + '. No successful backup or recovery has been recorded.')));
    });
    const copied = restore ? pipeline(fs.createReadStream(file), child.stdin) : pipeline(child.stdout, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
    // A full disk or broken input must also stop the child rather than leave it blocked on a pipe.
    copied.catch(() => child.kill());
    const outcomes = await Promise.allSettled([completed, copied]);
    const failure = outcomes.find(r => r.status === 'rejected');
    if (failure) throw failure.reason;
}
// One INSERT per row gives deterministic data checksums without loading personal records into memory.
async function summarize(file) {
    const tables = Object.create(null);
    let name = null, schema = [];
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
        const create = line.match(/^CREATE TABLE `([A-Za-z0-9_]+)` \(/);
        if (create) {
            name = create[1]; schema = [];
            if (tables[name]) throw Error('Duplicate table definition in backup.');
            tables[name] = { rows: 0, data: crypto.createHash('sha256') };
        }
        if (name) {
            schema.push(line);
            if (line.endsWith(';')) { tables[name].schemaHash = hash(schema.join('\n')); name = null; }
        }
        const insert = line.match(/^INSERT INTO `([A-Za-z0-9_]+)` /);
        if (insert) {
            const table = tables[insert[1]];
            if (!table || !line.endsWith(';')) throw Error('Unsupported INSERT format in backup.');
            table.rows++; table.data.update(line + '\n');
        }
    }
    if (name || !Object.keys(tables).length) throw Error('Incomplete backup schema.');
    return Object.fromEntries(Object.keys(tables).sort().map(key => {
        const t = tables[key]; return [key, { rows: t.rows, schemaHash: t.schemaHash, dataHash: t.data.digest('hex') }];
    }));
}
async function createBackup(config) {
    return locked(config, async () => {
        const db = await mysql.createConnection(config.connection);
        const id = 'permit-backup-' + new Date().toISOString().replace(/[-:.]/g, '') + '-' + crypto.randomBytes(6).toString('hex');
        const directory = backupDirectory(config.output, id);
        try {
            const tables = await inventory(db, config.connection.database);
            const [[version]] = await db.query('SELECT VERSION() version');
            const [[schema]] = await db.query('SELECT DEFAULT_CHARACTER_SET_NAME charsetName, DEFAULT_COLLATION_NAME collationName FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [config.connection.database]);
            await fsp.mkdir(directory, { mode: 0o700 });
            const sql = path.join(directory, 'database.sql');
            await runClient(config.dump, DUMP_OPTIONS, config.connection, sql);
            const summary = await summarize(sql);
            if (JSON.stringify(Object.keys(summary)) !== JSON.stringify(tables) || JSON.stringify(await inventory(db, config.connection.database)) !== JSON.stringify(tables)) throw Error('Schema inventory changed during backup. Try again when schema changes have finished.');
            const manifest = { formatVersion: 1, id, createdAt: new Date().toISOString(), database: config.connection.database, serverVersion: version.version, charset: schema.charsetName, collation: schema.collationName, sqlFile: 'database.sql', sha256: await fileHash(sql), tables: summary, files: [], scope: 'Selected database only. Uploaded media, source code and server configuration require separate backups.' };
            await jsonWrite(path.join(directory, 'manifest.json'), manifest);
            return { id, directory, tables: tables.length, rows: Object.values(summary).reduce((sum, t) => sum + t.rows, 0), backup: 'complete', recovery: 'not tested' };
        } finally { await db.end(); }
    });
}
async function checkRelationships(db, database) {
    const [keys] = await db.query('SELECT TABLE_NAME childTable, CONSTRAINT_NAME constraintName, COLUMN_NAME childColumn, REFERENCED_TABLE_NAME parentTable, REFERENCED_COLUMN_NAME parentColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION', [database]);
    const groups = new Map();
    for (const key of keys) { const id = key.childTable + '.' + key.constraintName; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(key); }
    const results = [];
    for (const [constraint, columns] of groups) {
        const first = columns[0];
        const present = columns.map(k => 'c.' + quote(k.childColumn) + ' IS NOT NULL').join(' AND ');
        const match = columns.map(k => 'p.' + quote(k.parentColumn) + '=c.' + quote(k.childColumn)).join(' AND ');
        const [[row]] = await db.query(`SELECT COUNT(*) missing FROM ${quote(first.childTable)} c WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${quote(first.parentTable)} p WHERE ${match})`);
        results.push({ constraint, missing: Number(row.missing) });
    }
    return results;
}
async function verifyBackup(config, id) {
    if (!['localhost', '127.0.0.1', '::1'].includes(config.connection.host)) throw Error('This version verifies recovery on the local MySQL server only.');
    return locked(config, async () => {
        const directory = backupDirectory(config.output, id);
        if (await fsp.realpath(directory) !== path.join(await fsp.realpath(config.output), id)) throw Error('Backup folders cannot be links to another location.');
        const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'manifest.json'), 'utf8'));
        if (manifest.formatVersion !== 1 || manifest.id !== id || manifest.database !== config.connection.database || manifest.sqlFile !== 'database.sql') throw Error('Backup manifest does not match this permit database.');
        const sql = path.join(directory, 'database.sql');
        try {
            if ((await fsp.lstat(sql)).isSymbolicLink()) throw Error('The SQL backup cannot be a link to another file.');
            if (await fileHash(sql) !== manifest.sha256) throw Error('Backup checksum mismatch. Recovery verification was stopped before creating a database.');
            if (JSON.stringify(await summarize(sql)) !== JSON.stringify(manifest.tables)) throw Error('Backup table checksums do not match the manifest.');
        } catch (e) {
            await jsonWrite(path.join(directory, 'verification.json'), { backupId: id, backupSha256: manifest.sha256, checkedAt: new Date().toISOString(), status: 'failed', cleanup: true, error: e.message });
            throw e;
        }
        const suffix = crypto.randomBytes(10).toString('hex');
        const scratch = 'permit_recovery_test_' + suffix;
        const user = 'permit_verify_' + suffix.slice(0, 12);
        const password = crypto.randomBytes(32).toString('hex');
        if (!/^permit_recovery_test_[a-f0-9]{20}$/.test(scratch) || scratch === config.connection.database) throw Error('Invalid recovery database.');
        const admin = await mysql.createConnection({ ...config.connection, database: undefined });
        const report = { backupId: id, backupSha256: manifest.sha256, checkedAt: new Date().toISOString(), status: 'failed', testDatabase: scratch, checks: [], cleanup: false };
        let databaseCreated = false, userCreated = false, workDirectory, reader;
        try {
            await admin.query(`CREATE DATABASE ${quote(scratch)} CHARACTER SET ${quote(manifest.charset)} COLLATE ${quote(manifest.collation)}`);
            databaseCreated = true;
            await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [user, 'localhost', password]);
            userCreated = true;
            // GRANT database names treat underscores as wildcards unless escaped.
            await admin.query('GRANT ALL PRIVILEGES ON `' + scratch.replace(/_/g, '\\_') + '`.* TO ?@?', [user, 'localhost']);
            const isolated = { ...config.connection, database: scratch, user, password };
            reader = await mysql.createConnection(isolated);
            const [grants] = await reader.query('SHOW GRANTS');
            if (grants.some(row => Object.values(row).some(value => /GRANT (?!USAGE).* ON \*\.\*/.test(String(value))))) throw Error('Verification account unexpectedly has global privileges.');
            // Confirm the temporary account cannot read the source database.
            let sourceReadable = false;
            try { await reader.query(`SELECT 1 FROM ${quote(config.connection.database)}.${quote(Object.keys(manifest.tables)[0])} LIMIT 0`); sourceReadable = true; }
            catch (e) { if (![1044, 1142].includes(e.errno)) throw e; }
            if (sourceReadable) throw Error('Verification account can access the source database; stopping.');
            await runClient(config.client, ['--default-character-set=utf8mb4', '--binary-mode'], isolated, sql, true);
            workDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'permit-recovery-'));
            const restoredDump = path.join(workDirectory, 'restored.sql');
            await runClient(config.dump, DUMP_OPTIONS, isolated, restoredDump);
            const restored = await summarize(restoredDump);
            const names = await inventory(reader, scratch);
            if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.tables))) throw Error('Restored table inventory differs from the backup.');
            for (const [table, expected] of Object.entries(manifest.tables)) {
                const [[count]] = await reader.query(`SELECT COUNT(*) count FROM ${quote(table)}`);
                const passed = Number(count.count) === expected.rows && JSON.stringify(restored[table]) === JSON.stringify(expected);
                report.checks.push({ table, rows: Number(count.count), expectedRows: expected.rows, passed });
            }
            report.relationships = await checkRelationships(reader, scratch);
            if (report.checks.some(c => !c.passed) || report.relationships.some(r => r.missing)) throw Error('Restored data, schema, or relationships do not match. See verification.json for the affected tables.');
            report.status = 'passed';
        } catch (e) { report.error = e.message; }
        finally {
            const failures = [];
            if (reader) await reader.end().catch(() => failures.push('Could not close test connection.'));
            if (databaseCreated) await admin.query('DROP DATABASE ' + quote(scratch)).catch(() => failures.push('Could not remove test database ' + scratch));
            if (userCreated) await admin.query('DROP USER ?@?', [user, 'localhost']).catch(() => failures.push('Could not remove temporary user ' + user));
            if (workDirectory) {
                await fsp.unlink(path.join(workDirectory, 'restored.sql')).catch(e => { if (e.code !== 'ENOENT') failures.push('Could not remove temporary verification dump.'); });
                await fsp.rmdir(workDirectory).catch(() => failures.push('Could not remove temporary verification folder.'));
            }
            await admin.end();
            report.cleanup = failures.length === 0;
            if (failures.length) { report.status = 'failed'; report.cleanupErrors = failures; }
            await jsonWrite(path.join(directory, 'verification.json'), report);
        }
        if (report.status !== 'passed') throw Error(report.error || (report.cleanupErrors || []).join(' '));
        return report;
    });
}
async function listBackups(config) {
    assertPrivateDirectory(config.output);
    const entries = await fsp.readdir(config.output, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    const results = [];
    for (const entry of entries.filter(e => e.isDirectory() && ID.test(e.name)).sort((a, b) => b.name.localeCompare(a.name))) {
        const directory = backupDirectory(config.output, entry.name);
        try {
            const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'manifest.json'), 'utf8'));
            if (manifest.id !== entry.name || manifest.formatVersion !== 1) throw Error('Invalid manifest.');
            let verification;
            try { verification = JSON.parse(await fsp.readFile(path.join(directory, 'verification.json'), 'utf8')); } catch {}
            const intact = await fileHash(path.join(directory, 'database.sql')) === manifest.sha256;
            results.push({ id: entry.name, createdAt: manifest.createdAt, database: manifest.database, tables: Object.keys(manifest.tables).length, backup: intact ? 'complete' : 'corrupt', recovery: intact ? (verification?.backupSha256 === manifest.sha256 ? verification.status : 'not tested') : 'failed', lastCheckedAt: verification?.checkedAt || null });
        } catch { results.push({ id: entry.name, backup: 'incomplete', recovery: 'not tested' }); }
    }
    return results;
}
async function main() {
    const [command, id, ...extra] = process.argv.slice(2);
    if (!['create', 'verify', 'list'].includes(command) || extra.length || (command === 'verify' ? !id : id)) throw Error('Usage: node maintenance/permit-backup.js create | list | verify <backup-id>');
    const config = settings();
    const result = command === 'create' ? await createBackup(config) : command === 'verify' ? await verifyBackup(config, id) : await listBackups(config);
    console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error('Backup operation failed: ' + error.message); process.exitCode = 1; });
module.exports = { settings, assertPrivateDirectory, backupDirectory, summarize, fileHash, createBackup, verifyBackup, listBackups, checkRelationships };
