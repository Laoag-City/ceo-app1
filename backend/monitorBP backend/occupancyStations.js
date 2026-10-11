// Standard clearance workflow shared by creation and explicit empty-record setup.
const defaults=Object.freeze(['Line & Grade','Architectural','Civil / Structural','Electrical','Mechanical','Sanitary','Plumbing','Electronics','Fire Safety']);
async function seed(conn,id) {
    for(const name of defaults)await conn.query('INSERT INTO occupancy_routing_matrix (occupancy_id,discipline_name,engineer_name,signature_status,feedback_remarks) VALUES (?,?,?,?,?)',[id,name,'','Pending','']);
}
module.exports={defaults,seed};
