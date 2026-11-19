/**
 * MAINTAINER GUIDE
 * Queue API, workstation sessions, and Socket.IO updates (port 5000).
 * The database supplies queue state; broadcasts let kiosks, clerks, and the public monitor refresh after changes.
 * Use ticket-submission.js for ticket creation so retries retain the same submission identity. Queue reset is a separate destructive operation.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('../database');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || process.env.QUEUE_PORT || 5000);
require('../http-security')(app);
require('../office-services')(app, 'queue');
app.get('/api/health', cors(), (req,res)=>res.json({success:true}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const db = mysql.createPool({
    host: 'localhost',       
    user: 'root',            
    password: '', 
    database: 'queue_system', 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Queue uses approved permit accounts. Cookies are named separately, but each
// account has only one active sign-in across Permit and Queue.
const accountDb = mysql.createPool({host:process.env.PERMIT_DB_HOST || 'localhost',user:process.env.PERMIT_DB_USER || 'root',password:process.env.PERMIT_DB_PASSWORD || '',database:process.env.PERMIT_DB_NAME || 'permit_system',connectionLimit:5});
const accountAdapter={promise:()=>accountDb,query(sql,args,callback){if(typeof args==='function'){callback=args;args=[];}accountDb.query(sql,args).then(([rows])=>callback(null,rows),callback);}};
const sessions=require('../monitorBP backend/permitSessions').createPermitSessions(accountAdapter,{cookieName:process.env.QUEUE_COOKIE_NAME || 'queue_session'});
const sendQueueState = require('./queue-visibility')(sessions);
const queueAuth=require('./queue-auth')(sessions,hash=>sessions.isActiveSession(hash));
app.use('/api',sessions.resolve);
const authRouter=require('../monitorBP backend/authServer')(accountAdapter,sessions);
app.use('/api/auth',(req,res,next)=>{
    if(!['/login','/logout','/session','/activity'].includes(req.path))return res.status(404).json({success:false,message:'Not found.'});
    if(req.method!=='GET')return queueAuth.protectWrite(req,res,next);next();
},authRouter);
const {createQueueService, ensureQueueSchema} = require('./queue-service');
const queueTransition = createQueueService(db);

const ticketSubmissions = require('./ticket-submission').createTicketSubmission(db);
const {registerClientHistory, ensureClientHistorySchema, resetQueueWithHistory} = require('./client-history');
const {registerQueueReports, ensureReportSchema} = require('./queue-reports');

// --- Audit Log Writer ---
async function writeLog(user_station, action, details) {
    try {
        await db.query(
            "INSERT INTO audit_logs (user_station, action, details) VALUES (?, ?, ?)",
            [user_station || 'System', action, details]
        );
    } catch (err) {
        // Log write failures are non-fatal — never let them break a request
        console.error("Audit log write failure:", err.message);
    }
}

// --- Data Transformer Helper ---
function mapTicket(row) {
    if (!row) return null;
    return {
        id: `TKT-${row.id}`,
        name: row.name,
        phone: row.phone,
        email: row.email,
        barangay: row.barangay,
        reason: row.reason,
        timestamp: row.created_at.toISOString(),
        calledBy: row.called_by,
        recallStamp: row.recall_stamp ? Number(row.recall_stamp) : null
    };
}

// --- DB-Driven State Retriever ---
// Reconstruct the public queue payload from stored tickets so reconnecting clients
// receive current state rather than depending on a history of socket messages.
async function getQueueState() {
    // One snapshot prevents a handoff appearing in both Serving and Finished
    // if another window changes the queue while this payload is being read.
    const [rows] = await db.query("SELECT * FROM tickets WHERE status IN ('waiting','holding','serving','completed') ORDER BY id ASC");
    const waitingRows=rows.filter(row=>row.status==='waiting');
    const holdRows=rows.filter(row=>row.status==='holding');
    const servingRows=rows.filter(row=>row.status==='serving').sort((a,b)=>Number(b.recall_stamp||0)-Number(a.recall_stamp||0));
    const finishedRows=rows.filter(row=>row.status==='completed').reverse();

    const waitingQueue = waitingRows.map(mapTicket);
    const holdQueue = holdRows.map(mapTicket);
    const nowServing = servingRows.length > 0 ? mapTicket(servingRows[0]) : null;

    return {
        queue: waitingQueue,      
        waiting: waitingQueue,    
        onHold: holdQueue,        
        serving: servingRows.map(mapTicket),
        finished: finishedRows.map(mapTicket),
        nowServing: nowServing
    };
}

const queueUpdates = require('./queue-updates')(getQueueState, sendQueueState, () => io.sockets.sockets.values());

// Helper function to broadcast the current database queue state to all connected clients
async function broadcastQueueUpdate() {
    try {
        await queueUpdates.broadcast();
    } catch (err) {
        console.error("Broadcasting Engine Failure:", err);
    }
}

// --- Socket.io Hub Listener ---
io.on('connection', async (socket) => {
    console.log(`Client attached to system hub: ${socket.id}`);
    
    try {
        await queueUpdates.connect(socket);
    } catch (err) {
        console.error("Initial Socket Payload Delivery Error:", err);
    }

    socket.on('disconnect', () => {
        console.log(`Client detached: ${socket.id}`);
    });
});

// Workstation selection requires a verified queue session, even for direct URLs.
// Public kiosk/monitor URLs remain available for unattended display devices.
app.get('/log-in.html', sessions.resolve, (req,res,next) => {
    res.set('Cache-Control','no-store');
    if(!req.user)sessions.clearCookie(res);
    next();
});
app.get('/workstations.html', sessions.resolve, (req,res,next) => {
    res.set('Cache-Control','no-store');
    if(!req.user) {
        sessions.clearCookie(res);
        return res.redirect(req.sessionReplaced ? '/log-in.html?session=replaced' : '/log-in.html');
    }
    next();
});
app.get('/secret-management.html', (req,res) => res.redirect('/workstations.html'));
app.get(['/client-history.html','/reports.html'], sessions.resolve, (req,res,next) => {
    res.set('Cache-Control','no-store');
    if (!req.user) {
        sessions.clearCookie(res);
        return res.redirect(req.sessionReplaced ? '/log-in.html?session=replaced' : '/log-in.html');
    }
    sessions.requireRoles('operator','admin','superadmin')(req,res,next);
});
// Serve frontend static directory directly
require('../database/preview')(app,path.join(__dirname, '..', '..', 'frontend', 'queue frontend'));
app.use(require('../database/preview').assets(path.join(__dirname, '..', '..', 'frontend', 'queue frontend')));
app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'queue frontend')));

// Serve portal.html from frontend root so Return links in queue pages work
app.get('/portal.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'portal.html'));
});

// 1. Workstation Session Management (Login)
app.post('/api/workstations/login',queueAuth.protectWrite,sessions.requireRoles('operator','admin','superadmin'),queueAuth.claim);
app.get('/api/workstations/session',queueAuth.requireWindow,(req,res)=>res.json({success:true,user:req.user,workspace:req.queueWorkspace}));
app.post('/api/workstations/logout',queueAuth.protectWrite,queueAuth.requireWindow,queueAuth.release);
registerClientHistory(app, db, sessions);
registerQueueReports(app, db, sessions);

// 3. Generate Ticket (Kiosk Form Intake submission)
// Ticket creation delegates duplicate/retry handling to the submission-key workflow.
app.post('/api/tickets', queueAuth.protectWrite, async (req, res) => {
    try {
        const result = await ticketSubmissions.submit(req.body);
        if (!result.duplicate) {
            await writeLog('Kiosk', 'TICKET_CREATED', 'New ticket '+result.ticketId+' registered for '+req.body.name+'.');
            // Ticket is committed: a display refresh failure must not make the client create another ticket.
            try { await broadcastQueueUpdate(); } catch (error) { console.error('Queue broadcast failed:',error.message); }
        }
        return res.json(result);
    } catch (error) {
        return res.status(error.status || 500).json({success:false,message:error.status?error.message:'Ticket submission could not be confirmed. Retry with the same form.'});
    }
});

// Window-scoped actions reject stale requests instead of replacing another ticket.
for (const action of ['call-next', 'next', 'resume', 'drop', 'recall', 'hold', 'complete']) {
    app.post('/api/tickets/' + action, queueAuth.protectWrite, queueAuth.requireWindow, async (req, res) => {
        try {
            const result = await queueTransition(action, {...req.body,workspace:req.queueWorkspace});
            const ticket = action === 'next' || action === 'resume' ? result.ticket : result;
            const completed = result.completedTicket || null;
            // The transition already committed: an audit/display refresh error
            // must not encourage retrying an action on the next client's ticket.
            try {
                if (completed) await writeLog(req.queueWorkspace,'COMPLETE',`Completed: TKT-${completed.id} (${completed.name}) at ${req.queueWorkspace}.`);
                if (ticket) await writeLog(req.queueWorkspace,action.replace('-', '_').toUpperCase(),
                    action + ': TKT-' + ticket.id + ' (' + ticket.name + ') at ' + req.queueWorkspace + '.');
            } catch (error) { console.error('Queue action saved; activity log failed:',error.message); }
            await broadcastQueueUpdate();
            res.json({success:true,ticket:ticket ? mapTicket(ticket) : null,completedTicket:completed ? mapTicket(completed) : null});
        } catch (error) {
            if (!error.status) console.error('Queue transition failed:', error);
            res.status(error.status || 500).json({success:false, message:error.status ? error.message : 'Queue action failed. Refresh before retrying.'});
        }
    });
}

// 7. Unhold Ticket via Control Grid
app.post('/api/tickets/unhold', queueAuth.protectWrite, queueAuth.requireWindow, async (req, res) => { 
    const {ticketId}=req.body;const workspace=req.queueWorkspace;
    if(typeof ticketId!=='string'||!/^TKT-[1-9]\d*$/.test(ticketId))return res.status(400).json({success:false,message:'Choose a valid ticket.'});
    const numericId=ticketId.slice(4);

    try {
        const [result] = await db.query("UPDATE tickets SET status = 'waiting' WHERE id = ? AND status = 'holding' AND reason IN (?)", [numericId,req.queueReasons]);

        if (result.affectedRows > 0) {
            console.log(`Ticket ${ticketId} restored from Hold array down to standard active array.`);

            const calledBy = workspace || 'System';
            await writeLog(calledBy, 'UNHOLD', `Ticket ${ticketId} returned to the waiting queue by ${calledBy}.`);

            await broadcastQueueUpdate();
            return res.json({ success: true });
        }

        return res.status(404).json({ success: false, message: "Target token node string index reference not found." });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Unhold query parsing failure." });
    }
});

// 9. Total Counter Reset Routine
// Reset affects the whole queue; preserve the explicit confirmation checks here.
app.post('/api/system/reset', queueAuth.protectWrite, sessions.requireRoles('admin','superadmin'), async (req, res) => {
    if (req.body.confirmation !== 'RESET') return res.status(400).json({success:false,message:'Type RESET in the confirmation dialog before resetting the queue.'});
    const { workspace } = req.body;
    try {
        // Reset snapshots previous clients before clearing the active queue.
        // PostgreSQL retains the narrow owner function and its transaction locks.
        const resetResult = await resetQueueWithHistory(db);
        queueAuth.clear();
        
        console.log("System initialization sequence triggered. All structures flushed.");

        const calledBy = req.user.username+' (#'+req.user.id+')';
        const numberingMessage = resetResult.numberingReset ? 'Ticket numbering restarted at 1001.' : 'Ticket numbering continues because the sequence restart failed.';
        await writeLog(calledBy, 'SYSTEM_RESET', `Full queue reset performed by ${calledBy}. Client history retained; active tickets and workstation claims cleared. ${numberingMessage}`);

        await broadcastQueueUpdate();
        return res.json({ success: true, ...(resetResult.numberingReset ? {} : {message:'Queue cleared and client history retained. Ticket numbering will continue.'}) });
    } catch (err) {
        return res.status(500).json({ success: false, message: "System initialization truncation error." });
    }
});

// 10. Fetch Audit Logs
app.get('/api/logs', sessions.requireRoles('admin','superadmin'), async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, user_station, action, details, timestamp FROM audit_logs ORDER BY id DESC LIMIT 100"
        );
        return res.json({ success: true, logs: rows });
    } catch (err) {
        console.error("Failed to fetch audit logs:", err);
        return res.status(500).json({ success: false, message: "Database error fetching audit logs." });
    }
});

// Boot listening layer
Promise.all([ensureQueueSchema(db),sessions.initialize(),ticketSubmissions.initialize(),ensureClientHistorySchema(db)])
.then(() => ensureReportSchema(db))
.then(() => server.listen(PORT, process.env.OFFICE_BIND_HOST || undefined, () => {
    console.log(`====================================================`);
    console.log(` Queue database engine: ${mysql.dialect} `);
    console.log(` Running local pass-through streams via port: ${PORT} `);
    console.log(`====================================================`);
})).catch(error => { console.error('Queue startup failed:', error); process.exitCode = 1; db.end(); accountDb.end(); });
