// Database-sized, server-side validation shared by permit creation and edits.
const fields = {
    permits:['project_title','location','owner_name','designer_name','permit_date'],
    occupancy:['bp_reference_no','project_title','location','owner_name','date_applied']
};
const limits = {project_title:255, location:255, owner_name:255, designer_name:255, bp_reference_no:100, sub_project_title:255, lot_number:100};
const bad = message => Object.assign(new Error(message), {status:400});
function calendar(value) {
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1000-01-01')return false;
    const date = new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
function text(key, value, sanitize = value => value.trim(), optional = false) {
    if(optional && value == null)return '';
    if(typeof value!=='string')throw bad(`${key.replace(/_/g,' ')} must be text.`);
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw bad(`${key.replace(/_/g,' ')} contains unsupported characters.`);
    const result = sanitize(value);
    if(!optional && !result)throw bad(`${key.replace(/_/g,' ')} is required.`);
    if(limits[key] && Array.from(result).length>limits[key])throw bad(`${key.replace(/_/g,' ')} must be ${limits[key]} characters or fewer.`);
    return result;
}
function metadata(kind, body, sanitize, partial = false) {
    if(!body || typeof body!=='object' || Array.isArray(body))throw bad('Provide the permit details.');
    const result = {};
    for(const key of fields[kind]) {
        if(partial && body[key]===undefined)continue;
        result[key] = text(key, body[key], sanitize);
        if((key==='permit_date' || key==='date_applied') && !calendar(result[key]))throw bad(`Enter a valid ${key.replace(/_/g,' ')}.`);
    }
    return result;
}
function lots(values, sanitize) {
    if(!Array.isArray(values) || !values.length)throw bad('At least one lot number is required.');
    return values.map(value => text('lot_number', value, sanitize));
}
module.exports = {fields, limits, calendar, text, metadata, lots};
