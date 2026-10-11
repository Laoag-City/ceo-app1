const test=require('node:test'),assert=require('node:assert/strict');
const {bind,convert}=require('./postgres-sql');
test('bindings preserve literal question marks, quotes, malicious text and nested bulk values',()=>{
 const value="x'); DELETE FROM users; --";
 assert.deepEqual(bind("SELECT '?' AS marker,? AS value WHERE id IN (?)",[value,[1,2]]),{sql:"SELECT '?' AS marker,$1 AS value WHERE id IN ($2,$3)",args:[value,1,2]});
 assert.deepEqual(bind('INSERT INTO permit_lots(permit_id,lot_number) VALUES ?',[[[1,'A'],[1,'B']]]),{sql:'INSERT INTO permit_lots(permit_id,lot_number) VALUES ($1,$2),($3,$4)',args:[1,'A',1,'B']});
 assert.throws(()=>bind('SELECT ?',[1,2]));assert.throws(()=>bind('SELECT ?',[]));assert.throws(()=>bind('SELECT ?',[[]]));
});
test('reviewed upserts target the correct unique keys',()=>{
 assert.match(convert('INSERT INTO occupancy_checklists (occupancy_id,checklist_state) VALUES (?,?) ON DUPLICATE KEY UPDATE checklist_state=VALUES(checklist_state)').sql,/ON CONFLICT \(occupancy_id\) DO UPDATE SET checklist_state=EXCLUDED.checklist_state/);
 assert.match(convert('INSERT IGNORE INTO ticket_submission_keys (request_id,fingerprint) VALUES (?,?)').sql,/ON CONFLICT DO NOTHING$/);
});
test('session issue locks the verified account row',()=>{
 assert.match(convert('INSERT INTO permit_sessions (token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=?').sql,/FOR SHARE$/);
 assert.doesNotMatch(convert('INSERT INTO permit_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').sql,/FOR SHARE/);
});
test('unrecognized aggregate queries fail instead of using the permit registry projection',()=>{
 assert.throws(()=>convert('SELECT GROUP_CONCAT(username) FROM users'));
});
