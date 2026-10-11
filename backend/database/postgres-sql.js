/** Reviewed SQL compatibility for existing application statements, not a general
 * MySQL parser. Advanced statements have explicit PostgreSQL equivalents below.
 * Add regression coverage when adding dialect-specific SQL. Values always bind.
 */
const identityTables=new Set(['users','permits','permit_lots','sub_permits','permit_routing_matrix','permit_change_requests','occupancy_permits','occupancy_routing_matrix','occupancy_inspections','occupancy_checklists','occupancy_change_requests','project_records','permit_final_reviews','system_disciplines','tickets','audit_logs','videos']);
function bind(sql,args=[]){
 let index=0;const values=[];
 // Skip quoted SQL strings/identifiers; never substitute question marks in literals.
 const text=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,token=>{
  if(token!=='?')return token;
  if(index>=args.length)throw Error('Missing query parameter');
  const value=args[index++];
  const add=v=>{values.push(v);return '$'+values.length;};
  if(Array.isArray(value)){
   if(!value.length)throw Error('Empty query list');
   return value.map(v=>Array.isArray(v)?'('+v.map(add).join(',')+')':add(v)).join(',');
  }
  return add(value);
 });
 if(index!==args.length)throw Error('Extra query parameters');
 return {sql:text,args:values};
}
function convert(sql,args=[]) {
 sql=sql.trim();
 // Prepared schema is a prerequisite. These startup calls validate presence only;
 // schema changes are performed by versioned administrator migration scripts.
 const create=/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/i.exec(sql);
 if(create)return {sql:`SELECT * FROM ${create[1]} LIMIT 0`,args:[]};
 const show=/^SHOW COLUMNS FROM ([a-z_]+) LIKE (\?|'([^']+)')/i.exec(sql);
 if(show)return {sql:'SELECT column_name AS "Field",data_type AS "Type" FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=? AND column_name=?',args:[show[1],show[3]||args[0]]};
 if(sql.includes('GROUP_CONCAT')) {
  if(!sql.includes('FROM permits p')||!sql.includes('as sub_permits'))throw Error('Unreviewed aggregate query');
  return {sql:require('./registry-query'),args};
 }
 if(sql.includes('CASE WHEN MAX(pr.last_seen)'))sql=`SELECT u.id,u.username,u.role,COALESCE(NULLIF(p.display_name,''),u.username) AS display_name,
 COALESCE(p.bio,'') AS bio,COALESCE(p.avatar_color,'blue') AS avatar_color,
 CASE WHEN MAX(pr.last_seen)>CURRENT_TIMESTAMP-INTERVAL '90 seconds' THEN
 CASE WHEN MAX(CASE WHEN pr.last_seen>CURRENT_TIMESTAMP-INTERVAL '90 seconds' THEN pr.last_active END)>CURRENT_TIMESTAMP-INTERVAL '5 minutes' THEN 'online' ELSE 'away' END ELSE 'offline' END AS status
 FROM users u LEFT JOIN permit_user_profiles p ON p.user_id=u.id
 LEFT JOIN permit_sessions s ON s.user_id=u.id AND s.expires_at>CURRENT_TIMESTAMP
 LEFT JOIN permit_presence pr ON pr.session_hash=s.token_hash
 WHERE u.is_verified=1 AND u.is_active=1
 AND u.username COLLATE "C" <> 'admin'
 AND NOT EXISTS(SELECT 1 FROM permit_people_settings h WHERE h.setting_key='hidden_account' AND h.user_id=u.id)
 AND (?::text='' OR strpos(lower(CONCAT(u.username,' ',COALESCE(p.display_name,''))) COLLATE "C",lower(?::text) COLLATE "C")>0)
 GROUP BY u.id,u.username,u.role,p.display_name,p.bio,p.avatar_color ORDER BY display_name,u.id LIMIT 31 OFFSET ?`;
 if(sql.startsWith('INSERT INTO permit_presence'))sql=`INSERT INTO permit_presence(session_hash,last_seen,last_active) VALUES (?,CURRENT_TIMESTAMP,CASE WHEN ? THEN CURRENT_TIMESTAMP END)
 ON CONFLICT(session_hash) DO UPDATE SET last_seen=CURRENT_TIMESTAMP,last_active=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE permit_presence.last_active END`;
 sql=sql.replace(/NOW\(3\)/gi,'CURRENT_TIMESTAMP').replace(/INTERVAL (\d+) (DAY|SECOND|MINUTE)\b/gi,"INTERVAL '$1 $2'");
 sql=sql.replace(/DATE_FORMAT\(created_at,\s*'%Y-%m-%d %H:%i:%s'\)/g,"to_char(created_at, 'YYYY-MM-DD HH24:MI:SS')");
 sql=sql.replace(/DATE_FORMAT\(created_at,\s*'%Y-%m-%d %H:%i:%s\.\%f'\)/g,"to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.US')");
 sql=sql.replace(/SUM\(is_verified=0 AND is_active=0\)/g,'SUM(CASE WHEN is_verified=0 AND is_active=0 THEN 1 ELSE 0 END)');
 for(const alias of ['buildingPending','occupancyPending','buildingDeletions','occupancyDeletions'])sql=sql.replace(new RegExp('\\b'+alias+'\\b','g'),'"'+alias+'"');
 sql=sql.replace(/\? IS NULL/g,'?::text IS NULL').replace(/ FROM DUAL\b/gi,'');
 sql=sql.replace(/^DELETE p FROM ([a-z_]+) p INNER JOIN ([a-z_]+) r ON (.+?) WHERE /i,'DELETE FROM $1 p USING $2 r WHERE $3 AND ');
 if(/^INSERT IGNORE /i.test(sql))sql=sql.replace(/^INSERT IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';
 const conflicts={permit_user_profiles:'user_id',occupancy_checklists:'occupancy_id'};
 for(const [table,key] of Object.entries(conflicts))if(sql.startsWith('INSERT INTO '+table)&&sql.includes('ON DUPLICATE KEY UPDATE'))sql=sql.replace('ON DUPLICATE KEY UPDATE',`ON CONFLICT (${key}) DO UPDATE SET`).replace(/VALUES\(([a-z_]+)\)/g,'EXCLUDED.$1');
 sql=sql.replace('ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)','ON CONFLICT (request_key) DO NOTHING');
 // Legacy INSERT...SELECT issuance needs a source-row lock in PostgreSQL.
 // New issuance locks the account explicitly in its transaction and inserts
 // VALUES; PostgreSQL does not allow FOR SHARE on that VALUES statement.
 if(/^INSERT INTO permit_sessions\b[\s\S]*\bSELECT\b/i.test(sql))sql+=' FOR SHARE';
 return {sql,args};
}
module.exports={convert,bind,identityTables};
