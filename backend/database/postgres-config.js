/** Cloud connections use a private variable for each database. Local Windows
 * connections still come from the launcher's decrypted configuration.
 */
module.exports = function configFor(database, env = process.env) {
 const common = {max:10, connectionTimeoutMillis:15000,
  options:'-c timezone=Asia/Manila -c lock_timeout=10000 -c statement_timeout=30000'};
 const key = {permit_system:'PERMIT_DATABASE_URL', queue_system:'QUEUE_DATABASE_URL'}[database];
 if (key && env[key]) {
  let url;
  try {
   url = new URL(env[key]);
   if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
       !url.username || !url.password || url.pathname.length < 2) throw Error();
  } catch {
   // URL parsing errors otherwise include the password-bearing input.
   throw Error(key + ' must be a complete PostgreSQL connection string.');
  }
  // Neon uses publicly trusted certificates. Verify the server as well as
  // encrypting traffic; URL SSL settings override pg's separate ssl option.
  url.searchParams.set('sslmode', 'verify-full');
  return {...common, connectionString:url.toString(), enableChannelBinding:true};
 }
 const settings = JSON.parse(env.OFFICE_PG_CONNECTIONS || '[]');
 const config = settings.find(c => c.source === database);
 if (!config || config.host !== 'localhost' ||
     !['permit_system_migration','queue_system_migration','permit_system_test','queue_system_test'].includes(config.database)) {
  throw Error('PostgreSQL credentials are not loaded. Use the local PostgreSQL launcher, or set the matching PERMIT_DATABASE_URL / QUEUE_DATABASE_URL for cloud hosting.');
 }
 return {...common, host:config.host, port:config.port || 5432,
  user:config.user, password:config.password, database:config.database,
  connectionTimeoutMillis:5000};
};
