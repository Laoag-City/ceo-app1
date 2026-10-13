/**
 * MAINTAINER GUIDE
 * Human-readable descriptions of permit field changes.
 * Maps stored fields and checklist keys into labels for audit records. Keep these labels aligned with the actual forms when fields are renamed.
 */
const requirements = {
  "cl01": "Duly Accomplished Application Form",
  "cl02": "Building Permit (Original or CTC)",
  "cl03": "Certificate of Final Electrical Inspection (CFEI)",
  "cl04": "Certificate of Final Mechanical Inspection (CFMI)",
  "cl_new1": "Photocopy of Valid Licenses",
  "cl_new2": "Construction Logbook",
  "cl05": "As-Built Architectural & Civil Plans",
  "cl06": "As-Built Electrical Plans",
  "cl07": "As-Built Sanitary / Plumbing Plans",
  "cl08": "As-Built Mechanical Plans",
  "cl09": "Structural Stability Certificate",
  "cl_new3": "Captioned Photographs of Site",
  "cl10": "BFP Fire Safety Inspection Certificate",
  "cl11": "Certification from zoning",
  "cl16": "Contractor's Affidavit of Completion"
};
const labels = { project_title:'Project', location:'Location', owner_name:'Owner', designer_name:'Designer', permit_date:'Date filed', lot_numbers:'Lots', engineer_name:'Engineer', signature_status:'Status', feedback_remarks:'Remarks', date_checked:'Date Checked', date_approved:'Date Approved', inspection_type:'Inspection', inspection_date:'Inspection date', inspector_name:'Inspector', result:'Result', findings:'Findings', next_inspection_date:'Next inspection' };
const clean = value => value == null ? '' : Array.isArray(value) ? value.map(clean).join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value).trim().replace(/<[^>]*>/g,'');
function compare(before, after, fields, prefix='') {
    const value=(key,raw)=>(key.endsWith('date') || key==='date_checked' || key==='date_approved') && raw ? require('./stationDates').calendar(raw) : clean(raw);
    return fields.filter(key => after[key] !== undefined && value(key,before[key]) !== value(key,after[key])).map(key => ({field:prefix+(labels[key] || key),before:value(key,before[key]),after:value(key,after[key])}));
}
function fromSnapshot(before, payload) {
    if(payload.station_id!==undefined) {
        const old=(before.matrix || []).find(row=>Number(row.id)===Number(payload.station_id));
        if(!old)return [];
        const calendar=require('./stationDates').calendar;
        return ['date_checked','date_approved'].filter(key=>calendar(old[key])!==calendar(payload[key])).map(key=>({field:old.discipline_name+' · '+(key==='date_checked'?'Date Checked':'Date Approved'),before:calendar(old[key]),after:calendar(payload[key])}));
    }
    if (Array.isArray(payload.updatedMatrixRows)) return payload.updatedMatrixRows.flatMap(row => {
        const old=(before.matrix || []).find(item=>Number(item.id)===Number(row.id));
        return old ? compare(old,row,['engineer_name','signature_status','feedback_remarks','date_checked','date_approved'],`${old.discipline_name}${old.sub_permit_id ? ' (sub-permit #'+old.sub_permit_id+')' : ''} · `) : [];
    });
    return compare(before,payload,['project_title','location','owner_name','designer_name','permit_date','lot_numbers']);
}
async function capture(query, kind, id, path, payload) {
    if(!id) return [];
    const occupancy=kind==='occupancy';
    if(Array.isArray(payload.updatedMatrixRows)) {
        const matrix=await query(occupancy ? 'SELECT * FROM occupancy_routing_matrix WHERE occupancy_id=?' : 'SELECT m.* FROM permit_routing_matrix m LEFT JOIN sub_permits s ON s.id=m.sub_permit_id WHERE m.permit_id=? OR s.permit_id=?',occupancy?[id]:[id,id]);
        return fromSnapshot({matrix},payload);
    }
    if(path.includes('/inspections')) {
        const inspectionId=path.match(/\/inspections\/(\d+)$/)?.[1];
        const rows=inspectionId?await query(occupancy ? 'SELECT * FROM occupancy_inspections WHERE id=? AND occupancy_id=?' : 'SELECT * FROM permit_inspections WHERE id=? AND permit_id=?',[inspectionId,id]):[];
        return compare(rows[0] || {},payload,['inspection_type','inspection_date','inspector_name','result','findings','next_inspection_date']);
    }
    if(payload.checklist_state && typeof payload.checklist_state==='object') {
        const rows=await query(occupancy?'SELECT checklist_state FROM occupancy_checklists WHERE occupancy_id=?':'SELECT checklist_state FROM permit_checklists WHERE permit_id=?',[id]);
        let old=rows[0]?.checklist_state || {};if(typeof old==='string')old=JSON.parse(old);
        const definition=occupancy?null:require('./buildingRequirements');
        const names=occupancy?requirements:Object.fromEntries([...definition.sections.flatMap(section=>section.items),...definition.procedure].map(item=>[item.id,item.title]));
        return [...new Set([...Object.keys(old),...Object.keys(payload.checklist_state)])].filter(key=>Boolean(old[key])!==Boolean(payload.checklist_state[key])).map(key=>{
            const procedure=!occupancy&&key.startsWith('procedure_');
            return {field:(procedure?'Procedure · ':'')+(names[key] || 'Requirement '+key),before:old[key]?(procedure?'Completed':'Received'):(procedure?'Not completed':'Not received'),after:payload.checklist_state[key]?(procedure?'Completed':'Received'):(procedure?'Not completed':'Not received')};
        });
    }
    if(Object.keys(payload).some(key=>['project_title','location','owner_name','designer_name','permit_date','lot_numbers'].includes(key))) {
        const rows=await query(`SELECT * FROM ${occupancy?'occupancy_permits':'permits'} WHERE id=?`,[id]);
        const before=rows[0] || {};
        if(!occupancy && payload.lot_numbers!==undefined)before.lot_numbers=(await query('SELECT lot_number FROM permit_lots WHERE permit_id=? ORDER BY id',[id])).map(row=>row.lot_number);
        return fromSnapshot(before,payload);
    }
    return [];
}
module.exports={compare,fromSnapshot,capture};
