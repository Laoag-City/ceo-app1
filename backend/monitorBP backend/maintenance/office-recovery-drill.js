/** Local recovery drill for both office databases and referenced queue videos.
 * Never restores over live tables. Uses the existing restricted-user restore
 * verifier; private output stays outside the website and the OneDrive project.
 */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const mysql=require('mysql2/promise');
const backup=require('./permit-backup');
async function main(){
    const base=backup.settings();
    // Honor the backup utility's explicit output override, including on Windows
    // installations that virtualize LocalAppData for packaged applications.
    const output=base.output;
    const results=[];
    for(const database of ['permit_system','queue_system']){
        const config={...base,connection:{...base.connection,database},output:path.join(output,database)};
        let mediaRows=[];
        const readMedia=async()=>{const db=await mysql.createConnection(config.connection);try{return (await db.query('SELECT id,filepath FROM videos ORDER BY id'))[0]}finally{await db.end()}};
        if(database==='queue_system')mediaRows=await readMedia();
        const created=await backup.createBackup(config);
        console.log(JSON.stringify({database,stage:'backup created',id:created.id,tables:created.tables,rows:created.rows}));
        const verified=await backup.verifyBackup(config,created.id);
        let media={status:'not applicable',files:[]};
        if(database==='queue_system'){
            if(JSON.stringify(mediaRows)!==JSON.stringify(await readMedia()))throw Error('Queue playlist changed during backup. Repeat the drill while uploads/deletions are idle.');
            const uploads=await fs.realpath(path.resolve(__dirname,'../../../frontend/queue frontend/uploads'));
            const mediaFolder=path.join(created.directory,'media');await fs.mkdir(mediaFolder);
            const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'office-media-recovery-'));
            const scratchFiles=[];
            try{
                const files=[];
                for(const filepath of [...new Set(mediaRows.map(row=>row.filepath))]){
                    if(typeof filepath!=='string'||!/^uploads\/[^/\\]+$/.test(filepath))throw Error('Unexpected queue media path; review before copying.');
                    const name=filepath.slice('uploads/'.length);
                    if(name==='.'||name==='..'||name.includes(':'))throw Error('Unsafe media filename.');
                    const source=path.join(uploads,name);
                    if(await fs.realpath(source)!==source||(await fs.lstat(source)).isSymbolicLink())throw Error('Media links are not supported.');
                    const hash=await backup.fileHash(source),destination=path.join(mediaFolder,name),restored=path.join(scratch,name);
                    await fs.copyFile(source,destination,require('node:fs').constants.COPYFILE_EXCL);
                    await fs.copyFile(destination,restored,require('node:fs').constants.COPYFILE_EXCL);scratchFiles.push(restored);
                    if(await backup.fileHash(source)!==hash||await backup.fileHash(destination)!==hash||await backup.fileHash(restored)!==hash)throw Error('Media changed during copying or restored checksum differs.');
                    files.push({filepath,backupPath:'media/'+name,sha256:hash,bytes:(await fs.stat(destination)).size,restored:true});
                }
                media={status:'passed',files};
            }finally{
                // Only exact files created by this run are removed; no recursive deletion.
                for(const file of scratchFiles)await fs.unlink(file);
                await fs.rmdir(scratch);
            }
            await fs.writeFile(path.join(created.directory,'media-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),...media},null,2),{flag:'wx',mode:0o600});
        }
        const result={database,id:created.id,directory:created.directory,tables:created.tables,rows:created.rows,relationships:verified.relationships.length,databaseRecovery:verified.status,cleanup:verified.cleanup,media:media.status,mediaFiles:media.files.length};
        results.push(result);console.log(JSON.stringify(result));
    }
    const report=path.join(output,'office-recovery-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
    await fs.writeFile(report,JSON.stringify({checkedAt:new Date().toISOString(),results,scope:'Database and referenced queue media restore verification. Does not include source code, MySQL users, machine configuration, or browser/application recovery testing.'},null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({status:'passed',report}));
}
if(require.main===module)main().catch(error=>{console.error('Office recovery drill failed: '+error.message);process.exitCode=1});
