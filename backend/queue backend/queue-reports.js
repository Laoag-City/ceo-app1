/** Staff reports use arrival-date cohorts in Asia/Manila. Timing is measured only
 * for registrations made after tracking started; old visits never become zeroes.
 * The same visit identity and counters are retained when the queue is reset.
 */
const crypto = require('node:crypto');

const {tasks} = require('./queue-services');
const windows = Object.fromEntries(Object.entries(tasks).map(([code,services]) =>
    [code,{label:`Window ${code.slice(2)}`,services}]));
const services = Object.values(windows).flatMap(window => window.services);
const reportFields = 'report_visit_id,report_tracking_started,first_called_at,completed_at,dropped_at,service_started_at,service_ms';
const reportDefinitions = {
    report_visit_id:'CHAR(36) NULL',
    report_tracking_started:'SMALLINT NOT NULL DEFAULT 0',
    first_called_at:'DATETIME(3) NULL',
    completed_at:'DATETIME(3) NULL',
    dropped_at:'DATETIME(3) NULL',
    service_started_at:'DATETIME(3) NULL',
    service_ms:'BIGINT NOT NULL DEFAULT 0'
};
const manilaDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});

function localDate(value) {
    const parts = manilaDate.formatToParts(value);
    return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
}

async function ensureReportColumns(db, table) {
    if (!['tickets','queue_client_history_archive'].includes(table)) throw Error('Unexpected report table.');
    if (db.dialect === 'postgres') {
        // The owner migration applies schema changes; runtime only validates them.
        await db.query(`SELECT ${reportFields} FROM ${table} LIMIT 0`);
        return;
    }
    for (const [name,definition] of Object.entries(reportDefinitions)) {
        const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name]);
        if (!columns.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
    const [createdColumns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'created_at'`);
    if (createdColumns.length && !/\(3\)/.test(createdColumns[0].Type || '')) {
        await db.query(`ALTER TABLE ${table} MODIFY created_at TIMESTAMP(3) NOT NULL${table === 'tickets' ? ' DEFAULT CURRENT_TIMESTAMP(3)' : ''}`);
    }
    // UUID identity is independent of the ticket number, which can be reused.
    await db.query(`UPDATE ${table} SET report_visit_id=UUID() WHERE report_visit_id IS NULL`);
}

async function ensureReportSchema(db) {
    await ensureReportColumns(db, 'tickets');
    await ensureReportColumns(db, 'queue_client_history_archive');
}

function asDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

/** Runs on the caller's locked transaction, before its commit. Recall never
 * resets these counters. Closing an active segment excludes time spent held.
 */
async function recordTicketTransition(conn, row, nextStatus, at = new Date()) {
    const firstCalled = asDate(row.first_called_at);
    const started = asDate(row.service_started_at);
    let serviceMs = Number(row.service_ms || 0);
    if (row.status === 'serving' && started) serviceMs += Math.max(0, at.getTime() - started.getTime());
    const called = nextStatus === 'serving' && !firstCalled ? at : firstCalled;
    await conn.query(`UPDATE tickets SET report_visit_id=?,first_called_at=?,completed_at=?,dropped_at=?,service_started_at=?,service_ms=? WHERE id=?`, [
        row.report_visit_id || crypto.randomUUID(), called,
        nextStatus === 'completed' ? at : asDate(row.completed_at),
        nextStatus === 'dropped' ? at : asDate(row.dropped_at),
        nextStatus === 'serving' ? at : null, serviceMs, row.id
    ]);
}

function bad(message) { throw Object.assign(new Error(message), {status:400}); }
function validDate(value, name) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad(`Choose a valid ${name} date.`);
    const timestamp = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== value || value < '2000-01-01' || value > '2100-12-31') bad(`Choose a valid ${name} date.`);
    return value;
}

function reportFilters(query = {}, now = new Date()) {
    const today = localDate(now);
    const from = validDate(query.from === undefined || query.from === '' ? today : query.from, 'start');
    const to = validDate(query.to === undefined || query.to === '' ? today : query.to, 'end');
    const days = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
    if (days < 1) bad('The end date must be on or after the start date.');
    if (days > 366) bad('Choose a date range of 366 days or fewer.');
    const window = query.window === undefined ? '' : query.window;
    const service = query.service === undefined ? '' : query.service;
    if (typeof window !== 'string' || (window && !Object.hasOwn(windows, window))) bad('Choose a valid service window.');
    if (typeof service !== 'string' || (service && !services.includes(service))) bad('Choose a valid service.');
    return {from,to,window,service};
}

function counter() {
    return {registered:0,completed:0,dropped:0,waiting:0,holding:0,serving:0,waitTotal:0,waitMeasured:0,serviceTotal:0,serviceMeasured:0};
}
function addVisit(target, row) {
    target.registered++;
    if (Object.hasOwn(target, row.status) && ['completed','dropped','waiting','holding','serving'].includes(row.status)) target[row.status]++;
    const created = asDate(row.created_at), called = asDate(row.first_called_at), completed = asDate(row.completed_at);
    if (Number(row.report_tracking_started) !== 1 || !created || !called || called.getTime() < created.getTime() - 1000) return;
    // A database timestamp can round up a fraction of a millisecond relative to
    // the Node clock. An immediate call is a measured zero, not missing coverage.
    target.waitTotal += Math.max(0,called.getTime() - created.getTime()) / 1000;
    target.waitMeasured++;
    const serviceMs = Number(row.service_ms);
    if (row.status === 'completed' && completed && completed >= called && Number.isFinite(serviceMs) && serviceMs >= 0) {
        target.serviceTotal += serviceMs / 1000;
        target.serviceMeasured++;
    }
}
function finish(target) {
    const {waitTotal,serviceTotal,...result} = target;
    result.averageWaitSeconds = result.waitMeasured ? Math.round(waitTotal / result.waitMeasured * 100) / 100 : null;
    result.averageServiceSeconds = result.serviceMeasured ? Math.round(serviceTotal / result.serviceMeasured * 100) / 100 : null;
    result.timedVisits = result.waitMeasured;
    return result;
}

function aggregateReport(rows, filters) {
    const summary = counter();
    const daily = new Map();
    const perWindow = new Map(Object.keys(windows).map(window => [window, counter()]));
    for (let timestamp = Date.parse(filters.from + 'T00:00:00Z'); timestamp <= Date.parse(filters.to + 'T00:00:00Z'); timestamp += 86400000) {
        daily.set(new Date(timestamp).toISOString().slice(0,10), counter());
    }
    for (const row of rows) {
        const date = asDate(row.created_at);
        if (!date) continue;
        const day = localDate(date);
        if (!daily.has(day)) continue;
        // Preserve the actual window for served visits. Unassigned waiting/held
        // visits follow today's routing, including after a service reassignment.
        const window = ['serving','completed','dropped'].includes(row.status) && Object.hasOwn(windows, row.called_by)
            ? row.called_by
            : Object.keys(windows).find(key => windows[key].services.includes(row.reason));
        if ((filters.window && filters.window !== window) || (filters.service && filters.service !== row.reason)) continue;
        addVisit(summary, row);
        addVisit(daily.get(day), row);
        if (window) addVisit(perWindow.get(window), row);
    }
    return {
        success:true,filters,timezone:'Asia/Manila',cohort:'registered',
        summary:finish(summary),
        daily:[...daily].map(([date,value]) => ({date,...finish(value)})),
        windows:[...perWindow].map(([window,value]) => ({window,label:windows[window].label,...finish(value)})),
        timingCoverage:{measured:summary.waitMeasured,total:summary.registered,waitMeasured:summary.waitMeasured,serviceMeasured:summary.serviceMeasured}
    };
}

function createQueueReports(db, options = {}) {
    return async function readReport(query = {}) {
        const filters = reportFilters(query, options.now ? options.now() : new Date());
        const start = new Date(filters.from + 'T00:00:00+08:00');
        const end = new Date(new Date(filters.to + 'T00:00:00+08:00').getTime() + 86400000);
        const columns = `reason,status,created_at,called_by,${reportFields}`;
        let where = ' WHERE created_at>=? AND created_at<?';
        const args = [start,end];
        // Filter windows during aggregation so historical service/window pairs
        // remain searchable after their current assignment changes.
        if (filters.service) { where += ' AND reason=?'; args.push(filters.service); }
        // One statement sees a coherent snapshot during a concurrent reset, with
        // no client names/contact details exposed to the aggregate report.
        const [rows] = await db.query(`SELECT ${columns} FROM (SELECT ${columns} FROM tickets UNION ALL SELECT ${columns} FROM queue_client_history_archive) report_visits${where}`, args);
        return aggregateReport(rows, filters);
    };
}

function registerQueueReports(app, db, sessions) {
    const readReport = createQueueReports(db);
    app.get('/api/reports', sessions.requireRoles('operator','admin','superadmin'), async (req,res) => {
        res.set('Cache-Control','no-store');
        try { res.json(await readReport(req.query)); }
        catch (error) {
            if (!error.status) console.error('Queue report failed:', error.code || 'REPORT_UNAVAILABLE');
            res.status(error.status || 503).json({success:false,message:error.status ? error.message : 'Queue reports are unavailable. Please try again.'});
        }
    });
}

module.exports = {windows,reportFields,reportDefinitions,ensureReportColumns,ensureReportSchema,recordTicketTransition,reportFilters,aggregateReport,createQueueReports,registerQueueReports};
