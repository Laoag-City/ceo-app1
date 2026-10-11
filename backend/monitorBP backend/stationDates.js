/**
 * MAINTAINER GUIDE
 * Calendar-only Date Checked and Date Approved rules.
 * These values are dates, not timestamps. Preserve YYYY-MM-DD semantics to avoid timezone shifts; approval requires a checked date and cannot precede it.
 * The migration adds missing nullable date columns to both routing tables.
 */
const calendar = value => value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : value ? String(value).slice(0,10) : '';
function validate(payload, today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
    const checked=payload.date_checked, approved=payload.date_approved;
    for(const date of [checked,approved]) {
        if(date===null || date==='')continue;
        if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Object.assign(new Error('Enter a valid calendar date.'),{status:400});
        if(date>today)throw Object.assign(new Error('Station dates cannot be in the future.'),{status:400});
    }
    if(approved && (!checked || approved<checked))throw Object.assign(new Error('Date Approved requires Date Checked and cannot be earlier.'),{status:400});
}
async function migrate(db) {
    for(const table of ['permit_routing_matrix','occupancy_routing_matrix'])for(const field of ['date_checked','date_approved']) {
        const [rows]=await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[field]);
        if(!rows.length)await db.query(`ALTER TABLE ${table} ADD COLUMN ${field} DATE NULL`);
    }
}
module.exports={calendar,validate,migrate};
