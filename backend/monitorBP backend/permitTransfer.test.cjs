const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
const express=require('express');
const transfer=require('./permitTransfer');
const occupancyStations=require('./occupancyStations');
const ExcelJS=require('exceljs');
const permitWorkbook=require('./permitWorkbook');
const bp='project_title,location,owner_name,designer_name,permit_date,lot_numbers\r\n';
const op='project_title,location,owner_name,bp_reference_no,date_applied\r\n';
test('CSV validates dates, required fields, lot lengths and strict headers',()=>{
    assert.equal(transfer.validate('permits',bp+'House,Brgy 15,Owner,Designer,2026-09-26,Lot 1 | Lot 2')[0].errors.length,0);
    assert.ok(transfer.validate('permits',bp+'House,,Owner,Designer,2026-02-30,Lot 1 | lot 1')[0].errors.length>=3);
    assert.throws(()=>transfer.validate('permits','project_id,'+bp),/Columns/);
    assert.throws(()=>transfer.validate('permits',bp+'"Unclosed'),/Unclosed/);
    assert.throws(()=>transfer.validate('permits',bp+Array(101).fill('A,B,C,D,2026-01-01,E').join('\n')),/100/);
    assert.throws(()=>transfer.validate('permits','x'.repeat(80001)),/80 KB/);
    assert.ok(transfer.validate('occupancy',op+'<script>,Place,Owner,BP-1,2026-01-01')[0].errors.length);
});
test('quoted CSV preserves commas, quotes, multiline fields and Unicode',()=>{
    const row=transfer.validate('occupancy','\uFEFF'+op+'"Café, ""Annex""","Place\nStreet",Owner,BP-1,2026-01-01')[0];
    assert.equal(row.data.project_title,'Café, "Annex"');assert.equal(row.data.location,'Place\nStreet');assert.equal(row.errors.length,0);
});
test('CSV reports quote correctly and neutralize spreadsheet formulas',()=>{
    const output=transfer.csv([['=1+1',' \t@SUM(1)','Safe, "text"','ñ']]);
    assert.ok(output.startsWith('\uFEFF'));assert.match(output,/"'=1\+1"/);assert.match(output,/"' \t@SUM/);assert.match(output,/Safe, ""text""/);
});
test('Excel round trip preserves literal text, Unicode, dates and workbook formatting',async()=>{
    const buffer=await permitWorkbook('permits',['project_id','project_title','permit_date','status'],[['BP-1','=1+1','2026-09-26','Approved'],['BP-2','Café, "Annex"',null,'In review']]);
    const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
    const sheet=book.getWorksheet('Building Permits');
    assert.equal(sheet.getCell('A2').value,'BP-1');
    assert.equal(sheet.getCell('B2').value,'=1+1');assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);
    assert.equal(sheet.getCell('B3').value,'Café, "Annex"');
    assert.equal(sheet.getCell('C2').value.toISOString(),'2026-09-26T00:00:00.000Z');
    assert.equal(sheet.getCell('C2').numFmt,'mmm d, yyyy');assert.equal(sheet.getCell('C3').value,null);
    assert.equal(sheet.getRow(1).getCell(1).font.bold,true);assert.equal(sheet.views[0].ySplit,1);
    assert.equal(sheet.autoFilter,'A1:D3');assert.ok(sheet.getColumn(2).width>=30);
});

test('Excel round trip retains extended conditional formatting with the patched UUID dependency',async()=>{
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Security regression');
    sheet.addRows([[1],[2],[3]]);
    sheet.addConditionalFormatting({ref:'A1:A3',rules:[{type:'dataBar',cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF1769AA'}}]});
    const buffer=await book.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    const result=loaded.getWorksheet('Security regression');
    assert.equal(result.getCell('A3').value,3);
    assert.equal(result.conditionalFormattings[0].ref,'A1:A3');
    assert.equal(result.conditionalFormattings[0].rules[0].type,'dataBar');
});

test('real database import/export: atomicity, preview, permissions and retries',async t=>{
    const database='permit_transfer_test_'+crypto.randomBytes(10).toString('hex');
    assert.match(database,/^permit_transfer_test_[a-f0-9]{20}$/);
    const control=await mysql.createConnection({host:'localhost',user:'root'});let created=false,server;
    try {
        await control.query('CREATE DATABASE `'+database+'`');created=true;await control.query('USE `'+database+'`');
        await control.query('CREATE TABLE permits (id INT AUTO_INCREMENT PRIMARY KEY,project_title VARCHAR(255),location VARCHAR(255),owner_name VARCHAR(255),designer_name VARCHAR(255),permit_date DATE) ENGINE=InnoDB');
        await control.query('CREATE TABLE occupancy_permits (id INT AUTO_INCREMENT PRIMARY KEY,project_title VARCHAR(255),location VARCHAR(255),owner_name VARCHAR(255),bp_reference_no VARCHAR(100),date_applied DATE) ENGINE=InnoDB');
        await control.query('CREATE TABLE permit_lots (id INT AUTO_INCREMENT PRIMARY KEY,permit_id INT,lot_number VARCHAR(100),FOREIGN KEY (permit_id) REFERENCES permits(id)) ENGINE=InnoDB');
        await control.query('CREATE TABLE sub_permits (id INT PRIMARY KEY,permit_id INT) ENGINE=InnoDB');
        await control.query('CREATE TABLE permit_routing_matrix (id INT AUTO_INCREMENT PRIMARY KEY,permit_id INT,sub_permit_id INT,discipline_name VARCHAR(100),engineer_name VARCHAR(100),signature_status VARCHAR(50),feedback_remarks TEXT,date_checked DATE,date_approved DATE) ENGINE=InnoDB');
        await control.query('CREATE TABLE occupancy_routing_matrix (id INT AUTO_INCREMENT PRIMARY KEY,occupancy_id INT,discipline_name VARCHAR(100),engineer_name VARCHAR(100),signature_status VARCHAR(50),feedback_remarks TEXT,date_checked DATE,date_approved DATE,FOREIGN KEY (occupancy_id) REFERENCES occupancy_permits(id)) ENGINE=InnoDB');
        await control.query('CREATE TABLE permit_final_reviews (id INT AUTO_INCREMENT PRIMARY KEY,kind VARCHAR(16),project_id INT,decision VARCHAR(16),snapshot_hash CHAR(64),remarks TEXT) ENGINE=InnoDB');
        const connect=()=>mysql.createConnection({host:'localhost',user:'root',database,dateStrings:['DATE']});
        const sessions={requireRoles:(...roles)=>(req,res,next)=>!req.user?res.status(401).json({message:'Sign in'}):roles.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'})};
        const feature=transfer(connect,sessions);await feature.initialize();
        const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('test-role'))req.user={id:12,role:req.get('test-role')};next()});app.use('/transfer',feature.router);
        server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
        const call=async(kind,action,body,role='admin')=>{
            const r=await fetch(`http://127.0.0.1:${server.address().port}/transfer/${kind}/${action}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(role?{'test-role':role}:{})},body:body?JSON.stringify(body):undefined});
            const type=r.headers.get('content-type');
            return {status:r.status,type,filename:r.headers.get('content-disposition'),body:type.includes('json')?await r.json():type.includes('spreadsheetml')?Buffer.from(await r.arrayBuffer()):await r.text()};
        };
        const text=bp+'House,Brgy 15,Owner,Designer,2026-09-26,Lot 1 | Lot 2';
        let request,ids;
        await t.test('operators can export, but cannot preview/import; anonymous blocked',async()=>{
            assert.equal((await call('permits','preview',{csv:text},'operator')).status,403);
            assert.equal((await call('permits','import',{csv:text},'operator')).status,403);
            assert.equal((await call('permits','export',{ids:[]},null)).status,401);
            assert.equal((await call('permits','export',{ids:[]},'operator')).status,200);
        });
        await t.test('preview writes nothing; simultaneous duplicate clicks create one batch',async()=>{
            const p=await call('permits','preview',{csv:text});assert.equal(p.body.valid,true);
            assert.equal((await control.query('SELECT COUNT(*) n FROM permits'))[0][0].n,0);
            request={csv:text,version:p.body.version,requestId:crypto.randomUUID(),allowDuplicates:false};
            const results=await Promise.all([call('permits','import',request),call('permits','import',request)]);
            assert.deepEqual(results.map(r=>r.status),[200,200]);assert.deepEqual(results[0].body.ids,results[1].body.ids);ids=results[0].body.ids;
            assert.equal((await control.query('SELECT COUNT(*) n FROM permits'))[0][0].n,1);
            assert.equal((await control.query('SELECT COUNT(*) n FROM permit_lots'))[0][0].n,2);
            const [stations]=await control.query('SELECT * FROM permit_routing_matrix WHERE permit_id=1 ORDER BY id');
            assert.deepEqual(stations.map(row=>row.discipline_name),[...require('./buildingStations').defaults]);assert.equal(stations.length,9);
            for(const row of stations){assert.equal(row.signature_status,'Pending');assert.equal(row.engineer_name,'');assert.equal(row.feedback_remarks,'');assert.equal(row.date_checked,null);assert.equal(row.date_approved,null);}
            const replay=await call('permits','import',request);assert.equal(replay.body.replayed,true);assert.deepEqual((await control.query('SELECT * FROM permit_routing_matrix WHERE permit_id=1 ORDER BY id'))[0],stations);
            assert.equal((await control.query('SELECT COUNT(*) n FROM occupancy_routing_matrix'))[0][0].n,0);
            assert.equal((await call('permits','import',{...request,csv:text.replace('House','Altered')})).status,409);
        });
        await t.test('filtered export contains stable ID, calendar date, lots and status only',async()=>{
            const result=await call('permits','export',{ids},'operator');assert.equal(result.status,200);
            assert.match(result.body,/BP-1/);assert.match(result.body,/2026-09-26/);assert.match(result.body,/Lot 1 \| Lot 2/);assert.doesNotMatch(result.body,/password|rejection_history|actor_id/);
            assert.doesNotMatch((await call('permits','export',{ids:[]})).body,/House/);
            const excel=await call('permits','export',{ids,format:'xlsx'},'operator');
            assert.equal(excel.status,200);assert.match(excel.filename,/permits-export.xlsx/);
            const book=new ExcelJS.Workbook();await book.xlsx.load(excel.body);
            assert.equal(book.worksheets[0].rowCount,2);assert.equal(book.worksheets[0].getCell('A2').value,'BP-1');
            assert.equal((await call('permits','export',{ids,format:'pdf'})).status,400);
        });
        await t.test('duplicate preview needs acknowledgement; changed preview is rejected',async()=>{
            const p=(await call('permits','preview',{csv:text})).body;assert.deepEqual(p.rows[0].duplicates,['BP-1']);
            assert.equal((await call('permits','import',{csv:text,version:p.version,requestId:crypto.randomUUID()})).status,400);
            assert.equal((await call('permits','import',{csv:text,version:'stale',requestId:crypto.randomUUID(),allowDuplicates:true})).status,409);
            assert.equal((await call('permits','import',{csv:text,version:p.version,requestId:crypto.randomUUID(),allowDuplicates:true})).status,200);
        });
        await t.test('occupancy imports seed nine pending stations atomically; replay preserves saved station details',async()=>{
            const csv=op+'Occupancy,Place,Applicant,BP-2026-1,2026-09-26';
            const p=(await call('occupancy','preview',{csv})).body;
            const request={csv,version:p.version,requestId:crypto.randomUUID()};
            assert.deepEqual((await call('occupancy','import',request)).body.ids,[1]);
            const [stations]=await control.query('SELECT * FROM occupancy_routing_matrix WHERE occupancy_id=1 ORDER BY id');
            assert.deepEqual(stations.map(row=>row.discipline_name),[...occupancyStations.defaults]);
            assert.equal(stations.length,9);
            for(const station of stations){assert.equal(station.signature_status,'Pending');assert.equal(station.engineer_name,'');assert.equal(station.feedback_remarks,'');assert.equal(station.date_checked,null);assert.equal(station.date_approved,null);}
            await control.query("UPDATE occupancy_routing_matrix SET engineer_name='Historical reviewer',signature_status='Rejected',feedback_remarks='Keep this history',date_checked='2026-09-26' WHERE occupancy_id=1 AND discipline_name='Electrical'");
            const [beforeReplay]=await control.query('SELECT * FROM occupancy_routing_matrix WHERE occupancy_id=1 ORDER BY id');
            const replay=await call('occupancy','import',request);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.ids,[1]);
            assert.deepEqual((await control.query('SELECT * FROM occupancy_routing_matrix WHERE occupancy_id=1 ORDER BY id'))[0],beforeReplay);
            assert.equal((await control.query('SELECT COUNT(*) n FROM permit_routing_matrix'))[0][0].n,18);
            assert.match((await call('occupancy','export',{ids:[1]})).body,/OP-1/);
            const book=new ExcelJS.Workbook();await book.xlsx.load((await call('occupancy','export',{ids:[1],format:'xlsx'})).body);
            assert.equal(book.worksheets[0].name,'Occupancy Permits');assert.equal(book.worksheets[0].getCell('A2').value,'OP-1');
            assert.equal((await call('occupancy','import',{csv:csv.replace('2026-09-26','2026-02-30'),version:p.version,requestId:crypto.randomUUID()})).status,400);
            assert.equal((await control.query('SELECT COUNT(*) n FROM occupancy_permits'))[0][0].n,1);
        });
        await t.test('exports label completed stations as ready, before any final decision',async()=>{
            await control.query("UPDATE permit_routing_matrix SET signature_status='Approved' WHERE permit_id=1");
            await control.query("UPDATE occupancy_routing_matrix SET signature_status='Approved' WHERE occupancy_id=1");
            for(const kind of ['permits','occupancy'])assert.match((await call(kind,'export',{ids:[1]})).body,/Ready for final review/);
        });
        await t.test('an occupancy station failure rolls back every project, station and batch without changing existing records',async()=>{
            await control.query("CREATE TRIGGER fail_test_occupancy_station BEFORE INSERT ON occupancy_routing_matrix FOR EACH ROW BEGIN IF NEW.discipline_name='Fire Safety' AND (SELECT project_title FROM occupancy_permits WHERE id=NEW.occupancy_id)='Second occupancy' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic station failure'; END IF; END");
            const csv=op+'First occupancy,Place A,Applicant A,BP-A,2026-09-26\nSecond occupancy,Place B,Applicant B,BP-B,2026-09-26';
            const preview=(await call('occupancy','preview',{csv})).body;
            const beforeRecords=(await control.query('SELECT * FROM occupancy_permits ORDER BY id'))[0];
            const beforeStations=(await control.query('SELECT * FROM occupancy_routing_matrix ORDER BY id'))[0];
            const requestId=crypto.randomUUID();
            assert.equal((await call('occupancy','import',{csv,version:preview.version,requestId})).status,503);
            assert.deepEqual((await control.query('SELECT * FROM occupancy_permits ORDER BY id'))[0],beforeRecords);
            assert.deepEqual((await control.query('SELECT * FROM occupancy_routing_matrix ORDER BY id'))[0],beforeStations);
            assert.equal((await control.query('SELECT COUNT(*) n FROM permit_import_batches WHERE request_id=?',[requestId]))[0][0].n,0);
        });
        await t.test('failure on second record rolls back the entire batch and lots',async()=>{
            await control.query("CREATE TRIGGER fail_test_lot BEFORE INSERT ON permit_lots FOR EACH ROW BEGIN IF NEW.lot_number='FAIL' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic failure'; END IF; END");
            const csv=bp+'First,Place A,A,Designer,2026-09-26,Okay\nSecond,Place B,B,Designer,2026-09-26,FAIL';
            const p=(await call('permits','preview',{csv})).body;
            const before=(await control.query('SELECT COUNT(*) n FROM permits'))[0][0].n;
            const beforeStations=(await control.query('SELECT * FROM permit_routing_matrix ORDER BY id'))[0];
            assert.equal((await call('permits','import',{csv,version:p.version,requestId:crypto.randomUUID()})).status,503);
            assert.equal((await control.query('SELECT COUNT(*) n FROM permits'))[0][0].n,before);
            assert.deepEqual((await control.query('SELECT * FROM permit_routing_matrix ORDER BY id'))[0],beforeStations);
            assert.equal((await control.query("SELECT COUNT(*) n FROM permit_lots WHERE lot_number='Okay'"))[0][0].n,0);
        });
    }finally{
        if(server)await new Promise(resolve=>server.close(resolve));
        if(created)await control.query('DROP DATABASE `'+database+'`');
        await control.end();
    }
});
