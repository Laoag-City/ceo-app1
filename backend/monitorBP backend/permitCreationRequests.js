const {hash}=require('./permitDuplicates');
// Blank additive fields must not change existing retry fingerprints.
function contentHash(data) {
    const normalized={...data};
    for(const key of ['phone_number','email'])if(!normalized[key])delete normalized[key];
    return hash(normalized);
}
const schema=`CREATE TABLE IF NOT EXISTS permit_creation_requests (
    actor_id INT NOT NULL,request_id CHAR(36) NOT NULL,kind VARCHAR(16) NOT NULL,
    content_hash CHAR(64) NOT NULL,project_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(actor_id,request_id),FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB`;
function key(body) {
    if(body.requestId===undefined)return null; // Keep existing API clients compatible.
    if(typeof body.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId))throw Object.assign(Error('Invalid permit submission ID. Refresh the page and try again.'),{status:400});
    return body.requestId.toLowerCase();
}
async function prior(conn,userId,requestId,kind,data) {
    if(!requestId)return null;
    const [[row]]=await conn.query('SELECT kind,content_hash,project_id FROM permit_creation_requests WHERE actor_id=? AND request_id=?',[userId,requestId]);
    if(!row)return null;
    if(row.kind!==kind||row.content_hash!==contentHash(data))throw Object.assign(Error('This submission already saved different permit details. Review the registry before starting another application.'),{status:409});
    const table=kind==='permits'?'permits':'occupancy_permits';
    const [[record]]=await conn.query('SELECT id FROM '+table+' WHERE id=?',[row.project_id]);
    if(!record)throw Object.assign(Error('This submission created a permit that has since been deleted. It will not be created again by retrying.'),{status:409});
    return Number(row.project_id);
}
async function save(conn,userId,requestId,kind,data,id) {
    if(requestId)await conn.query('INSERT INTO permit_creation_requests (actor_id,request_id,kind,content_hash,project_id) VALUES (?,?,?,?,?)',[userId,requestId,kind,contentHash(data),id]);
}
module.exports={key,prior,save,initialize:db=>db.query(schema)};
