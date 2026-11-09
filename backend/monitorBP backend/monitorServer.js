/**
 * MAINTAINER GUIDE
 * Permit API and page server (port 3000).
 * Registers both permit registries and delegates approval, inspection, date, and audit rules to sibling modules. Numeric primary keys remain the API identifiers; BP/OP references are frontend display values.
 * When adding a write route, check its role rules and whether operators must submit a change request instead of editing the live record.
 */
const express = require('express');
const mysql = require('../database');
const path = require('path');
const cors = require('cors'); 

const app = express();
const PORT = Number(process.env.PORT || process.env.PERMIT_PORT || 3000);
const permitAging = require('./permitAging');
require('../http-security')(app);
require('../office-services')(app, 'permits');

app.use(express.json({limit:'256kb'}));
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'monitorBP frontend');
require('../database/preview')(app,frontendPath);
// Only the public health response is cross-origin readable by the portal.
app.get('/api/health', cors(), (req,res)=>res.json({success:true}));
const db = mysql.createConnection({
    host: 'localhost', 
    user: 'root', 
    password: '', 
    database: 'permit_system',
    // Calendar dates must reach the browser as YYYY-MM-DD, not UTC timestamps.
    dateStrings: ['DATE']
});

const deletionWorkflow = require('./deletionWorkflow')(db);
const bulkDeletionPool = mysql.createPool({
    host: db.config.host, port: db.config.port, user: db.config.user,
    password: db.config.password, database: db.config.database
});
const bulkDeletionWorkflow = require('./bulkDeletionWorkflow')(() => bulkDeletionPool.getConnection());
const inspectionWorkflow = require('./inspectionWorkflow')(() => mysql.createConnection({host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,database:db.config.database}).promise());
const buildingInspections = require('./inspectionWorkflow')(() => mysql.createConnection({host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,database:db.config.database}).promise(), 'permits');
// Keep transaction snapshot serialization stable for requests already awaiting review.
// Detail responses format calendar fields explicitly; internal snapshot dates retain
// the old serialization so existing approval requests remain comparable.
const editWorkflow = require('./editWorkflow')(() => mysql.createConnection({
    host: db.config.host, port: db.config.port, user: db.config.user,
    password: db.config.password, database: db.config.database
}).promise(), sanitizeInputString);
const occupancyCreation=require('./occupancyCreation')(()=>mysql.createConnection({
    host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,database:db.config.database
}).promise(),{sanitize:sanitizeInputString,validDate:validFormDate});
const buildingCreation=require('./buildingCreation')(()=>mysql.createConnection({
    host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,database:db.config.database
}).promise(),{sanitize:sanitizeInputString,validDate:validFormDate});

db.connect(async (err) => {
    if (err) { console.error('Database Connection Error:', err.code || 'connection failed'); db.end(); process.exitCode=1; return; }
    console.log('Connected to Database.');

    const dbPromise = db.promise();

    const schemaQueries = [        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'operator',
            is_verified TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS permits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_title VARCHAR(255) NOT NULL,
            location VARCHAR(255) NOT NULL,
            owner_name VARCHAR(255) NOT NULL,
            designer_name VARCHAR(255) NOT NULL,
            permit_date DATE NOT NULL,
            rejection_history TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS permit_lots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT,
            lot_number VARCHAR(100) NOT NULL,
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS sub_permits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT,
            sub_project_title VARCHAR(255),
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS permit_routing_matrix (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT NULL,
            sub_permit_id INT NULL,
            discipline_name VARCHAR(100) NOT NULL,
            engineer_name VARCHAR(100) DEFAULT '',
            signature_status VARCHAR(50) DEFAULT 'Pending',
            feedback_remarks TEXT,
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE,
            FOREIGN KEY (sub_permit_id) REFERENCES sub_permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS permit_change_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT NOT NULL,
            requested_by INT NULL,
            change_type VARCHAR(50) NOT NULL DEFAULT 'permit_update',
            changes JSON,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            remarks TEXT,
            reviewed_by VARCHAR(50) DEFAULT '',
            reviewed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
        );`,
        `CREATE TABLE IF NOT EXISTS occupancy_permits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            bp_reference_no VARCHAR(100) NOT NULL,
            project_title VARCHAR(255) NOT NULL,
            location VARCHAR(255) NOT NULL,
            owner_name VARCHAR(255) NOT NULL,
            date_applied DATE NOT NULL,
            rejection_history TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS occupancy_routing_matrix (
            id INT AUTO_INCREMENT PRIMARY KEY,
            occupancy_id INT,
            discipline_name VARCHAR(100) NOT NULL,
            engineer_name VARCHAR(100) DEFAULT '',
            signature_status VARCHAR(50) DEFAULT 'Pending',
            feedback_remarks TEXT,
            FOREIGN KEY (occupancy_id) REFERENCES occupancy_permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS permit_inspections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT NOT NULL,
            inspection_type VARCHAR(50) NOT NULL DEFAULT 'Preliminary',
            inspection_date DATE NOT NULL,
            inspector_name VARCHAR(150) NOT NULL,
            result VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
            findings TEXT NOT NULL,
            next_inspection_date DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX permit_inspections_parent_date (permit_id, inspection_date, id),
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS occupancy_inspections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            occupancy_id INT NOT NULL,
            inspection_type VARCHAR(50) NOT NULL DEFAULT 'Preliminary',
            inspection_date DATE NOT NULL,
            inspector_name VARCHAR(150) DEFAULT '',
            result VARCHAR(50) DEFAULT 'Scheduled',
            findings TEXT,
            next_inspection_date DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (occupancy_id) REFERENCES occupancy_permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS permit_checklists (
            id INT AUTO_INCREMENT PRIMARY KEY,
            permit_id INT NOT NULL UNIQUE,
            checklist_state JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS occupancy_checklists (
            id INT AUTO_INCREMENT PRIMARY KEY,
            occupancy_id INT NOT NULL UNIQUE,
            checklist_state JSON,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (occupancy_id) REFERENCES occupancy_permits(id) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS occupancy_change_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            occupancy_id INT NOT NULL,
            requested_by INT NULL,
            change_type VARCHAR(50) NOT NULL DEFAULT 'occupancy_update',
            changes JSON,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            remarks TEXT,
            reviewed_by VARCHAR(50) DEFAULT '',
            reviewed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (occupancy_id) REFERENCES occupancy_permits(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
        );`,
    ];

    try {
        for (let query of schemaQueries) {
            await dbPromise.query(query);
        }
        console.log('Database schema validated and aligned.');
        await require('./stationDates').migrate(dbPromise);
        await require('./stationWorkflowSchema')(dbPromise);
        
        await sessions.initialize();
        await peopleProfiles.initialize();
        await permitTransfer.initialize();
        await require('./permitCreationRequests').initialize(dbPromise);
        await projectRecords.initialize();
        app.listen(PORT, process.env.OFFICE_BIND_HOST || undefined, () => console.log('Permit server ready on port '+PORT+' ('+mysql.dialect+')'));
    } catch (dbErr) {
        console.error('Database Initialization Error:', dbErr.message);
        db.end(); process.exitCode=1;
    }
});

// --- INTEGRATED AUTHENTICATION ROUTER ---
const sessions = require('./permitSessions').createPermitSessions(db,{openConnection:()=>bulkDeletionPool.getConnection()});
const peopleProfiles = require('./peopleProfiles')(db,sessions,()=>mysql.createConnection({
    host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,database:db.config.database
}).promise());
const permitTransfer = require('./permitTransfer')(() => mysql.createConnection({
    host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password,
    database:db.config.database,dateStrings:['DATE']
}).promise(),sessions);
app.use(sessions.resolve);
app.get(['/login','/login.html','/admin_login.html','/occupancy_login.html'], (req,res,next) => {
    res.set('Cache-Control','no-store');
    if(!req.user)sessions.clearCookie(res);
    next();
});
app.use('/api', sessions.protectWrites);
const authRouter = require('./authServer')(db, sessions,()=>mysql.createConnection({database:db.config.database,host:db.config.host,port:db.config.port,user:db.config.user,password:db.config.password}).promise());
app.use('/api/auth', authRouter);
app.use('/api', sessions.requireUser);
app.use('/api',(req,res,next)=>{
    if(req.user.role==='superadmin' && !/^\/(auth(?:\/|$)|people(?:\/|$)|profile(?:\/|$)|presence(?:\/|$)|admin\/overview$)/.test(req.path))return res.status(403).json({success:false,message:'Superadmins manage accounts and station assignments. Engineering review belongs to the admin.'});
    next();
});
app.use('/api', peopleProfiles.router);
app.use('/api', require('./adminOverview')(db,sessions));
app.use('/api/admin/monthly-reports',require('./monthlyReports')(()=>bulkDeletionPool.getConnection(),sessions));
app.use('/api/permit-transfer', permitTransfer.router);
app.use('/api', (req,res,next)=>{
    if (/^\/(permits|occupancy)\/change-requests\//i.test(req.path)) return sessions.requireRoles('admin')(req,res,next);
    // Routing removal uses the same authenticated staff roles as station creation.
    if (req.method==='DELETE' && /^\/matrix\/remove\/?$/i.test(req.path)) return sessions.requireRoles('operator','admin','superadmin')(req,res,next);
    next();
});
app.use(require('./permitPages')(frontendPath, sessions));
app.use(require('../database/preview').assets(frontendPath));
app.use(express.static(frontendPath));
const projectRecords = require('./projectRecords')(db);
projectRecords.routes(app);
// Bulk requests have their own retained audit row, rather than a cascading permit
// change request. Session, origin and IT-workspace restrictions apply above.
for (const kind of ['permits', 'occupancy']) {
    app.get('/api/permit-deletions/' + kind, bulkDeletionWorkflow.status(kind));
    app.post('/api/permit-deletions/' + kind, bulkDeletionWorkflow.submit(kind));
    app.put('/api/permit-deletions/' + kind + '/:id/approve', bulkDeletionWorkflow.review(kind, 'approve'));
    app.put('/api/permit-deletions/' + kind + '/:id/reject', bulkDeletionWorkflow.review(kind, 'reject'));
    // Direct admin deletions write their audit snapshot inside the deletion
    // transaction. Operators continue through the existing approval/audit path.
    const directDelete=bulkDeletionWorkflow.remove(kind);
    app.delete('/api/'+kind+'/:id',(req,res,next)=>req.user.role==='admin'?directDelete(req,res):next());
}
app.use(projectRecords.audit);
for(const kind of ['permits','occupancy']) {
    app.put(`/api/${kind}/:id/final-review`, editWorkflow.finalReview(kind));
    app.put(`/api/${kind}/:id/station-dates`, (req,res)=>editWorkflow.submit(kind,'station_dates',{
        station_id:req.body.station_id,date_checked:req.body.date_checked,date_approved:req.body.date_approved,expected_dates:req.body.expected_dates
    })(req,res));
}
// ----------------------------------------
app.get('/api/final-reviews',sessions.requireRoles('admin'),async(req,res)=>{
    try {
        const finalApproval=require('./finalApproval');
        const building=await finalApproval.projectList(db.promise(),'permits');
        const occupancy=await finalApproval.projectList(db.promise(),'occupancy');
        res.set('Cache-Control','no-store').json({success:true,projects:[...building,...occupancy]});
    } catch(error){res.status(503).json({success:false,message:'Final review records are unavailable. Please retry.'});}
});

// Utility sanitization method
function sanitizeInputString(rawString) {
    if (!rawString) return '';
    return rawString.toString().trim().replace(/<[^>]*>/g, '');
}

// ==========================================
// --- BUILDING PERMIT API ENDPOINTS ---
// ==========================================

app.post('/api/matrix/add', editWorkflow.routing('permits'));

app.delete('/api/matrix/remove', editWorkflow.routing('permits',true));

app.get('/api/permits', (req, res) => {
    const sql = `
        SELECT p.*, 
        (
            SELECT CONCAT('[', GROUP_CONCAT(JSON_QUOTE(lot_number)), ']') 
            FROM permit_lots 
            WHERE permit_id = p.id
        ) as lot_numbers,
        (
            SELECT CONCAT('[', GROUP_CONCAT(
                JSON_OBJECT('id', id, 'discipline', COALESCE(discipline_name, ''), 'status', COALESCE(signature_status, 'Pending'), 'date_checked', date_checked, 'date_approved', date_approved)
            ), ']')
            FROM permit_routing_matrix 
            WHERE permit_id = p.id
        ) as routing_tracks,
        (
            SELECT CONCAT('[', GROUP_CONCAT(
                JSON_OBJECT(
                    'id', sub.id,
                    'title', sub.sub_project_title,
                    'tracks', COALESCE((
                        SELECT CONCAT('[', GROUP_CONCAT(
                            JSON_OBJECT('id', m.id, 'discipline', COALESCE(m.discipline_name, ''), 'status', COALESCE(m.signature_status, 'Pending'), 'date_checked', m.date_checked, 'date_approved', m.date_approved)
                        ), ']')
                        FROM permit_routing_matrix m
                        WHERE m.sub_permit_id = sub.id
                    ), '[]')
                )
            ), ']')
            FROM sub_permits sub
            WHERE sub.permit_id = p.id
        ) as sub_permits
        FROM permits p 
        ORDER BY p.id DESC`;
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        require('./finalApproval').projectList(db.promise(),'permits').then(async projects=>{
            const byId=new Map(projects.map(p=>[Number(p.id),p.final_approval]));
            res.json(await permitAging.decorate(db.promise(),'permits',results.map(p=>({...p,final_approval:byId.get(Number(p.id))}))));
        }).catch(()=>res.status(503).json({message:'Permit approval or aging information is unavailable. Please retry.'}));
    });
});

app.get('/api/permits/:id', editWorkflow.read('permits'));

function validFormDate(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false; const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value; }
app.post('/api/permits', buildingCreation);
app.post('/api/permits/:id/stations/initialize', editWorkflow.initializeBuildingStations());

app.put('/api/permits/:id', (req, res) => {
    const permitId = Number(req.params.id);

    if (!Number.isSafeInteger(permitId) || permitId<1) return res.status(400).json({ success: false, message: 'Invalid permit id.' });

    const allowedFields = ['project_title', 'location', 'owner_name', 'designer_name', 'permit_date'];
    const incomingPayload = {};
    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) incomingPayload[field] = req.body[field];
    });

    if (req.body.lot_numbers !== undefined) {
        incomingPayload.lot_numbers = req.body.lot_numbers;
    }

    if (Object.keys(incomingPayload).length === 0) {
        return res.status(400).json({ success: false, message: 'No permit fields were provided.' });
    }

    return editWorkflow.submit('permits','permit_update',incomingPayload)(req,res);
});

app.put('/api/permits/:id/signatures', (req,res)=>editWorkflow.submit('permits','matrix_update',{updatedMatrixRows:req.body.updatedMatrixRows,newHistoricalEntries:req.body.newHistoricalEntries})(req,res));

app.get('/api/permits/change-requests/pending', (req, res) => {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only administrators can review permit edits.' });
    }

    const sql = `
        SELECT c.id, c.permit_id, c.change_type, c.changes, c.status, c.remarks, c.created_at,
               p.project_title, p.location, COALESCE(NULLIF(TRIM(up.display_name),''),u.username) AS requested_by_name
        FROM permit_change_requests c
        LEFT JOIN permits p ON p.id = c.permit_id
        LEFT JOIN users u ON u.id = c.requested_by
        LEFT JOIN permit_user_profiles up ON up.user_id = c.requested_by
        WHERE c.status = 'pending' AND c.change_type NOT IN ('matrix_update','station_dates')
        ORDER BY c.created_at DESC`;

    db.query(sql, async (err, results) => {
        if (err) return res.status(503).json({ success: false, message: 'Permit requests could not be loaded. Please retry.' });
        try { res.set('Cache-Control','no-store').json({ success: true, requests: [...await bulkDeletionWorkflow.pending('permits'), ...results] }); }
        catch (_) { res.status(503).json({ success: false, message: 'Permit requests could not be loaded. Please retry.' }); }
    });
});

app.put('/api/permits/change-requests/:id/approve', buildingInspections.review('approve'), deletionWorkflow.review('permits', 'approve'), editWorkflow.review('permits', 'approve'));

app.put('/api/permits/change-requests/:id/reject', buildingInspections.review('reject'), deletionWorkflow.review('permits', 'reject'), editWorkflow.review('permits', 'reject'));

app.use('/api/permits/:id/inspections', require('./inspectionRoutes')(buildingInspections,sessions));
app.get('/api/permits/:id/checklist', buildingInspections.readChecklist);
app.put('/api/permits/:id/checklist', sessions.requireRoles('operator'), buildingInspections.saveChecklist);

app.delete('/api/permits/:id', deletionWorkflow.submit('permits'));

// ==========================================
// --- OCCUPANCY PERMIT API ENDPOINTS ---
// ==========================================

app.use('/api/occupancy', require('./occupancyWorkspaceAccess'));

app.get('/api/occupancy', (req, res) => {
    db.query("SELECT * FROM occupancy_permits ORDER BY id DESC", (err, permits) => {
        if (err) return res.status(500).json({ error: err.message });

        db.query("SELECT * FROM occupancy_routing_matrix", (matrixErr, matrix) => {
            if (matrixErr) return res.status(500).json({ error: matrixErr.message });
            Promise.all([require('./finalApproval').projectList(db.promise(),'occupancy'),require('./stationAccess').engineers(db.promise())]).then(async ([projects,operators])=>{
                const byId=new Map(projects.map(p=>[Number(p.id),p.final_approval]));
                res.json({permits:await permitAging.decorate(db.promise(),'occupancy',permits.map(p=>({...p,final_approval:byId.get(Number(p.id))}))),matrix:matrix.map(row=>require('./stationAccess').engineer(row,operators))});
            }).catch(()=>res.status(503).json({message:'Permit approval or aging information is unavailable. Please retry.'}));
        });
    });
});

app.get('/api/occupancy/:id', editWorkflow.read('occupancy'));

app.post('/api/occupancy', occupancyCreation);
app.post('/api/occupancy/:id/stations/initialize', editWorkflow.initializeOccupancyStations());

app.post('/api/occupancy/matrix/add', editWorkflow.routing('occupancy'));

app.put('/api/occupancy/:id/signatures', (req,res)=>editWorkflow.submit('occupancy','matrix_update',{updatedMatrixRows:req.body.updatedMatrixRows,newHistoricalEntries:req.body.newHistoricalEntries})(req,res));

app.delete('/api/occupancy/:id', deletionWorkflow.submit('occupancy'));

app.delete('/api/occupancy/matrix/remove', editWorkflow.routing('occupancy',true));

// ==========================================
// --- INSPECTION ENDPOINTS ---
// ==========================================

// GET all inspections for a permit
app.get('/api/occupancy/:id/inspections', inspectionWorkflow.readInspections);

// GET all inspections across all permits (used by occupancy.html summary)
app.get('/api/occupancy/inspections/all', (req, res) => {
    db.query("SELECT * FROM occupancy_inspections ORDER BY inspection_date DESC", (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, inspections: rows });
    });
});

// POST create new inspection
app.post('/api/occupancy/:id/inspections', inspectionWorkflow.save());

// PUT update existing inspection
app.put('/api/occupancy/:id/inspections/:inspId', inspectionWorkflow.save(true));

// DELETE inspection record
app.delete('/api/occupancy/:id/inspections/:inspId', inspectionWorkflow.submit);

// ==========================================
// --- REQUIREMENTS CHECKLIST ENDPOINTS ---
// ==========================================

// GET checklist state for a permit
app.get('/api/occupancy/:id/checklist', inspectionWorkflow.readChecklist);

// PUT (upsert) checklist state for a permit
app.put('/api/occupancy/:id/checklist', inspectionWorkflow.saveChecklist);

// ==========================================
// --- OCCUPANCY CHANGE REQUEST ENDPOINTS ---
// ==========================================

app.get('/api/occupancy/change-requests/pending', (req, res) => {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only administrators can review occupancy change requests.' });
    }

    const sql = `
        SELECT c.id, c.occupancy_id, c.change_type, c.changes, c.status, c.remarks, c.created_at,
               o.project_title, o.location, COALESCE(NULLIF(TRIM(up.display_name),''),u.username) AS requested_by_name
        FROM occupancy_change_requests c
        LEFT JOIN occupancy_permits o ON o.id = c.occupancy_id
        LEFT JOIN users u ON u.id = c.requested_by
        LEFT JOIN permit_user_profiles up ON up.user_id = c.requested_by
        WHERE c.status = 'pending' AND c.change_type NOT IN ('matrix_update','station_dates')
        ORDER BY c.created_at DESC`;

    db.query(sql, async (err, results) => {
        if (err) return res.status(503).json({ success: false, message: 'Permit requests could not be loaded. Please retry.' });
        try { res.set('Cache-Control','no-store').json({ success: true, requests: [...await bulkDeletionWorkflow.pending('occupancy'), ...results] }); }
        catch (_) { res.status(503).json({ success: false, message: 'Permit requests could not be loaded. Please retry.' }); }
    });
});

app.put('/api/occupancy/change-requests/:id/approve', inspectionWorkflow.review('approve'), deletionWorkflow.review('occupancy', 'approve'), editWorkflow.review('occupancy', 'approve'));

app.put('/api/occupancy/change-requests/:id/reject', inspectionWorkflow.review('reject'), deletionWorkflow.review('occupancy', 'reject'), editWorkflow.review('occupancy', 'reject'));

// ==========================================
// --- FRONTEND ROUTE VIEW BINDINGS ---
// ==========================================

// permitPages routes the main URL to the public portal before static files.
app.get('/edit', (req, res) => res.sendFile(path.join(frontendPath, 'edit.html')));
app.get('/register', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(frontendPath, 'login.html')));

app.get('/occupancy_login.html', (req, res) => res.sendFile(path.join(frontendPath, 'occupancy_login.html')));

app.get('/occupancy', (req, res) => res.sendFile(path.join(frontendPath, 'occupancy.html')));
app.get('/occupancy/edit', (req, res) => res.sendFile(path.join(frontendPath, 'occupancy_edit.html')));
