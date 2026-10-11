const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
test('restore diagnostics distinguish altered records, missing schema objects and foreign keys',()=>{
 const {compareDescription}=require('./postgres-backup.cjs');
 const expected={tables:[{table:'permits',rows:2,sha256:'original'}],schemaHash:'schema',schemaParts:{constraints:'constraints',functions:'functions'},foreignKeys:3};
 const same=compareDescription(expected,expected);assert.ok(same.dataMatches&&same.schemaMatches&&same.foreignKeysMatch);assert.deepEqual(same.mismatchedTables,[]);assert.deepEqual(same.schemaDifferences,[]);
 const changed={...expected,tables:[{table:'permits',rows:2,sha256:'different'}],schemaHash:'different-schema',schemaParts:{constraints:'constraints',functions:'missing'},foreignKeys:2};
 const mismatch=compareDescription(changed,expected);assert.equal(mismatch.dataMatches,false);assert.equal(mismatch.schemaMatches,false);assert.equal(mismatch.foreignKeysMatch,false);assert.deepEqual(mismatch.mismatchedTables,['permits']);assert.deepEqual(mismatch.schemaDifferences,['functions']);
 assert.equal(compareDescription(changed,{...expected,schemaParts:undefined}).schemaDifferences,null);
});
test('equivalent literal array casts survive restore without accepting changed constraints',()=>{
 const {compareDescription,normalizeConstraintDefinition}=require('./postgres-backup.cjs');
 const outer="CHECK (((decision)::text = ANY ((ARRAY['approved'::character varying, 'returned'::character varying, 'invalidated'::character varying])::text[])))";
 const inner="CHECK (((decision)::text = ANY (ARRAY[('approved'::character varying)::text, ('returned'::character varying)::text, ('invalidated'::character varying)::text])))";
 assert.equal(normalizeConstraintDefinition(outer),normalizeConstraintDefinition(inner));assert.notEqual(normalizeConstraintDefinition(outer),outer);
 const constraint={table_name:'permit_final_reviews',conname:'decision_check',contype:'c',convalidated:true,definition:outer};
 const expected={tables:[],schemaHash:'before',schemaParts:{constraints:'before',indexes:'indexes',columns:'columns'},constraintDefinitions:[constraint],foreignKeys:0};
 const actual={...expected,schemaHash:'after',schemaParts:{...expected.schemaParts,constraints:'after'},constraintDefinitions:[{...constraint,definition:inner}]};
 assert.equal(compareDescription(actual,expected).schemaMatches,true);assert.equal(compareDescription(actual,expected).equivalentConstraintCasts,true);
 for(const changed of [inner.replace('returned','deleted'),inner.replace('decision','kind'),inner.replace('character varying','character varying(5)'),inner.replace('character varying','character')]){
  assert.equal(compareDescription({...actual,constraintDefinitions:[{...constraint,definition:changed}]},expected).schemaMatches,false);
 }
 assert.equal(compareDescription({...actual,constraintDefinitions:[]},expected).schemaMatches,false);
 assert.equal(compareDescription({...actual,constraintDefinitions:[{...constraint,convalidated:false,definition:inner}]},expected).schemaMatches,false);
 assert.equal(compareDescription({...actual,schemaParts:{...actual.schemaParts,indexes:'missing'}},expected).schemaMatches,false);
 assert.equal(normalizeConstraintDefinition("CHECK (notes = 'ARRAY[x]')"),"CHECK (notes = 'ARRAY[x]')");
 const quotedOuter=outer.replace('decision','"Review Decision"').replace('approved',"owner''s, review"),quotedInner=inner.replace('decision','"Review Decision"').replace('approved',"owner''s, review");
 assert.equal(normalizeConstraintDefinition(quotedOuter),normalizeConstraintDefinition(quotedInner));
});
test('backup verification rejects traversal, incomplete backups and altered archives before restore',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'office-pg-backup-test-'));
 process.env.OFFICE_BACKUP_ROOT=root;
 delete require.cache[require.resolve('./postgres-backup.cjs')];
 const {load,hash}=require('./postgres-backup.cjs');
 const id='pg-office-20261001000000-abcdef123456',folder=path.join(root,id),manifestFile=path.join(folder,'manifest.json');
 await fs.mkdir(folder);
 const names=['permit_system_migration','queue_system_migration'];
 const manifest={version:1,id,status:'creating',databases:names.map(source=>({source,file:source+'.dump',sha256:hash('fixture')})),media:[]};
 try{
  await assert.rejects(load('../escape'),/valid backup ID/);
  await fs.writeFile(manifestFile,JSON.stringify(manifest));
  await assert.rejects(load(id),/Incomplete/);
  manifest.status='backup-complete';await fs.writeFile(manifestFile,JSON.stringify(manifest));
  for(const name of names)await fs.writeFile(path.join(folder,name+'.dump'),'fixture');
  assert.equal((await load(id)).manifest.id,id);
  await fs.writeFile(path.join(folder,names[0]+'.dump'),'corrupt');
  await assert.rejects(load(id),/checksum mismatch/);
  await fs.writeFile(path.join(folder,names[0]+'.dump'),'fixture');
  manifest.databases[0].file='../outside.dump';await fs.writeFile(manifestFile,JSON.stringify(manifest));
  await assert.rejects(load(id),/checksum mismatch/);
 }finally{
  for(const file of [manifestFile,...names.map(n=>path.join(folder,n+'.dump'))])await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await fs.rmdir(folder);await fs.rmdir(root);
 }
});
