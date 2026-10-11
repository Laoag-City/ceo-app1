const defaults=Object.freeze(['Office of the Building Official','Land Use and Zoning','Architectural','Structural','Line and Grade','Sanitary','Electrical','Mechanical','CINSP BFP City Fire Marshal']);
async function seed(conn,id,subId=null) {
    const column=subId?'sub_permit_id':'permit_id',target=subId || id;
    for(const name of defaults)await conn.query('INSERT INTO permit_routing_matrix ('+column+',discipline_name,engineer_name,signature_status,feedback_remarks) VALUES (?,?,?,?,?)',[target,name,'','Pending','']);
}
module.exports={defaults,seed};
