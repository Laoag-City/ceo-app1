/**
 * MAINTAINER GUIDE
 * Approval lifecycle for proposed permit and routing edits.
 * Reads return an opaque version; submissions compare the editor's loaded version
 * inside a transaction before saving or queuing changes. Review compares the saved
 * snapshot with live data again. Direct edits and station changes use the same locks.
 * Each transaction owns its connection. Keep lock order consistent when extending this workflow; duplicate and stale checks belong inside the transaction.
 */
const crypto = require('node:crypto');
const stationDates = require('./stationDates');
const {requireVersion}=require('./recordVersion');
const stationAccess=require('./stationAccess');
const finalApproval=require('./finalApproval');
const occupancyStations=require('./occupancyStations');
const buildingStations=require('./buildingStations');
const validation=require('./permitValidation');
const configs = {
    permits: { records: 'permits', requests: 'permit_change_requests', key: 'permit_id', matrix: 'permit_routing_matrix' },
    occupancy: { records: 'occupancy_permits', requests: 'occupancy_change_requests', key: 'occupancy_id', matrix: 'occupancy_routing_matrix' }
};
function decode(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
// PostgreSQL approval history is append-only. The parent project row is already
// locked before these reads, so PostgreSQL needs no UPDATE privilege on history.
// Retain MySQL's current reads under its default REPEATABLE READ isolation.
const finalHistoryLock = conn => conn.dialect === 'postgres' ? '' : ' FOR UPDATE';

// Each operation owns its connection and transaction; unrelated HTTP requests cannot
// accidentally participate in one another's transaction on the legacy shared connection.
module.exports = function createEditWorkflow(openConnection, sanitize = value => String(value ?? '').trim()) {
    async function actor(conn, req, roles) {
        const id = Number(req.user?.id);
        if (!Number.isSafeInteger(id) || id < 1) throw invalid('Please sign in again.', 403);
        const [rows] = await conn.query('SELECT id, username, role FROM users WHERE id = ? AND is_active = 1 AND is_verified = 1 FOR UPDATE', [id]);
        const user = rows[0];
        if (!user || !roles.includes(user.role) || user.role !== (req.user?.role || '').toLowerCase()) throw invalid('Your account cannot perform this action.', 403);
        return user;
    }
    // Capture the review baseline from this transaction's connection, not from browser data.
    async function snapshot(conn, c, id) {
        const [records] = await conn.query(`SELECT * FROM ${c.records} WHERE id = ? FOR UPDATE`, [id]);
        if (!records.length) throw invalid('This permit no longer exists.', 404);
        const [matrix] = await conn.query(`SELECT * FROM ${c.matrix} WHERE ${c.key} = ? ORDER BY id FOR UPDATE`, [id]);
        const [approved] = await conn.query(`SELECT id FROM ${c.requests} WHERE ${c.key} = ? AND status = 'approved' ORDER BY id FOR UPDATE`, [id]);
        const state = { record: records[0], matrix, revision: approved.length };
        if (c.key === 'permit_id') {
            const [lots] = await conn.query('SELECT * FROM permit_lots WHERE permit_id = ? ORDER BY id FOR UPDATE', [id]);
            const [subs] = await conn.query('SELECT * FROM sub_permits WHERE permit_id = ? ORDER BY id FOR UPDATE', [id]);
            const [subMatrix] = await conn.query('SELECT m.* FROM permit_routing_matrix m INNER JOIN sub_permits s ON s.id = m.sub_permit_id WHERE s.permit_id = ? ORDER BY m.id FOR UPDATE', [id]);
            state.lots = lots; state.subs = subs; state.subMatrix = subMatrix;
        }
        const hashState={...state};
        const [finalReviews]=await conn.query('SELECT id FROM permit_final_reviews WHERE kind=? AND project_id=? ORDER BY id DESC LIMIT 1'+finalHistoryLock(conn),[c.key==='permit_id'?'permits':'occupancy',id]);
        // Empty history preserves the hashes on older pending requests.
        if(finalReviews.length)hashState.finalRevision=Number(finalReviews[0].id);
        for(const key of ['matrix','subMatrix'])if(state[key])hashState[key]=state[key].map(row=>{
            const copy={...row};
            for(const field of ['date_checked','date_approved','last_updated_by'])if(copy[field]==null)delete copy[field];
            return copy;
        });
        return { state, hash: digest(hashState) };
    }
    async function run(res, operation) {
        let conn;
        try {
            conn = await openConnection();
            await conn.beginTransaction();
            const result = await operation(conn);
            await conn.commit();
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            if (conn) await conn.rollback().catch(() => {});
            return res.status(err.status || 500).json({ success: false, conflict:err.status===409 && !err.duplicate, message: err.status ? err.message : 'Unable to save this request. No changes were applied. Please refresh and try again.' });
        } finally { if (conn) await conn.end(); }
    }
    function submit(kind, type, input) {
        const c = configs[kind];
        return (req, res) => run(res, async conn => {
            let payload=input;
            const user = await actor(conn, req, ['operator','admin']);
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) throw invalid('Invalid permit ID.');
            const current = await snapshot(conn, c, id);
            if(type!=='station_dates')requireVersion(req,current.hash);
            if(type==='permit_update') {
                if(kind!=='permits')throw invalid('Unsupported permit edit.');
                payload={...payload,...validation.metadata('permits',payload,sanitize,true)};
                if(payload.lot_numbers!==undefined)payload.lot_numbers=validation.lots(payload.lot_numbers,sanitize);
            }
            if(type==='permit_update' && proposedChanges(type,payload,current.state)===digest({}))return {body:{success:true,unchanged:true,message:'No project changes to save.',_version:current.hash}};
            if (type === 'matrix_update') {
                validateMatrix(payload, current.state);
                const originals=[...current.state.matrix,...(current.state.subMatrix || [])];
                await stationAccess.authorize(conn,user,payload.updatedMatrixRows.map(row=>originals.find(r=>Number(r.id)===Number(row.id))));
                const engineerName=await stationAccess.displayName(conn,user);
                if(payload.updatedMatrixRows.some(row=>row.engineer_name!==undefined && (typeof row.engineer_name!=='string' || row.engineer_name.trim()!==engineerName)))throw invalid('Assigned Engineer comes from your profile display name and cannot be edited here. Refresh the page or update your profile.');
                const changedIds=new Set(matrixChanges(payload,current.state).map(row=>row[0]));
                if (!changedIds.size) return {body:{success:true,unchanged:true,message:'No signature changes to save.',_version:current.hash}};
                const stationPayload={...payload,updatedMatrixRows:payload.updatedMatrixRows.filter(row=>changedIds.has(Number(row.id))).map(row=>({...row,engineer_name:engineerName,last_updated_by:user.id}))};
                await finalApproval.invalidate(conn,kind,id,user,current.state);
                res.locals=res.locals || {};
                res.locals.projectChangeDetail=JSON.stringify({version:1,changes:require('./projectChanges').fromSnapshot({matrix:originals},stationPayload)});
                await applyChanges(conn,c,id,type,stationPayload,current);
                return {body:{success:true,message:'Your station updates were saved.',_version:(await snapshot(conn,c,id)).hash}};
            }
            if(type==='station_dates') {
                stationDates.validate(payload);
                const row=[...current.state.matrix,...(current.state.subMatrix || [])].find(row=>Number(row.id)===Number(payload.station_id));
                if(!row)throw invalid('This station does not belong to the project.',404);
                await stationAccess.authorize(conn,user,[row]);
                if(!payload.expected_dates || ['date_checked','date_approved'].some(key=>stationDates.calendar(row[key])!==payload.expected_dates[key]))throw invalid('These dates changed. Close and reopen the popup before submitting again.',409);
                if(['date_checked','date_approved'].every(key=>stationDates.calendar(row[key])===stationDates.calendar(payload[key])))return {body:{success:true,unchanged:true,message:'No date changes to save.',_version:current.hash}};
                {
                    await finalApproval.invalidate(conn,kind,id,user,current.state);
                    res.locals=res.locals || {};
                    res.locals.projectChangeDetail=JSON.stringify({version:1,changes:require('./projectChanges').fromSnapshot({matrix:[row]},payload)});
                    const engineerName=await stationAccess.displayName(conn,user);
                    await conn.query(`UPDATE ${c.matrix} SET date_checked=?,date_approved=?,engineer_name=?,last_updated_by=? WHERE id=?`,[payload.date_checked || null,payload.date_approved || null,engineerName,user.id,row.id]);
                    return {body:{success:true,message:'Station dates saved.'}};
                }
            }
            if(user.role!=='operator') {
                await finalApproval.invalidate(conn,kind,id,user,current.state);
                await applyChanges(conn,c,id,type,payload,current);
                return {body:{success:true,message:'Changes saved.',_version:(await snapshot(conn,c,id)).hash}};
            }
            // The parent record is already locked, serializing submissions and reviews
            // for this permit even when two tabs submit at the same time.
            const fingerprint = proposedChanges(type, payload, current.state);
            const [pending] = await conn.query(`SELECT id, changes FROM ${c.requests} WHERE ${c.key} = ? AND change_type = ? AND status = 'pending' FOR UPDATE`, [id, type]);
            for (const request of pending) {
                let previous;
                try { previous = decode(request.changes); } catch { continue; }
                if (!previous || (previous._baseSnapshot && previous._baseSnapshot !== current.hash)) continue;
                if (proposedChanges(type, previous, current.state) === fingerprint) {
                    return { status: 409, body: { success: false, duplicate: true, requestId: request.id, message: 'These same changes are already awaiting administrator approval. No duplicate request was created.' } };
                }
            }
            const changes = { ...payload, _baseSnapshot: current.hash, _before: { ...current.state.record, lot_numbers: (current.state.lots || []).map(row => row.lot_number), matrix: [...current.state.matrix, ...(current.state.subMatrix || [])].map(row=>({...row, date_checked:stationDates.calendar(row.date_checked), date_approved:stationDates.calendar(row.date_approved)})) } };
            res.locals = res.locals || {};
            res.locals.projectChangeDetail = JSON.stringify({version:1,changes:require('./projectChanges').fromSnapshot(changes._before,payload)});
            await conn.query(`INSERT INTO ${c.requests} (${c.key}, requested_by, change_type, changes, status, remarks) VALUES (?, ?, ?, ?, 'pending', ?)`, [id, user.id, type, JSON.stringify(changes), 'Operator submitted changes for approval. Checked against the current permit version.']);
            return { body: { success: true, pending: true, message: 'Changes submitted for administrator approval.' } };
        });
    }
    function proposedChanges(type, changes, state) {
        if(type==='station_dates')return digest([Number(changes.station_id),stationDates.calendar(changes.date_checked),stationDates.calendar(changes.date_approved)]);
        if (type === 'matrix_update') {
            // Rejection-history timestamps are presentation metadata, not a new edit.
            return digest(matrixChanges(changes,state));
        }
        const values = {};
        for (const key of ['project_title', 'location', 'owner_name', 'designer_name', 'permit_date']) {
            if (changes[key] !== undefined && sanitize(changes[key]) !== sanitize(state.record[key])) values[key] = sanitize(changes[key]);
        }
        if (changes.lot_numbers !== undefined) {
            const lots = Array.isArray(changes.lot_numbers) ? changes.lot_numbers.map(sanitize) : changes.lot_numbers;
            if (JSON.stringify(lots) !== JSON.stringify((state.lots || []).map(row => sanitize(row.lot_number)))) values.lot_numbers = lots;
        }
        return digest(values);
    }
    function matrixChanges(changes,state) {
            const existing = [...state.matrix, ...(state.subMatrix || [])];
            return (changes.updatedMatrixRows || []).map(row => {
                const original = existing.find(item => Number(item.id) === Number(row.id));
                // Assigned Engineer is profile data, never a signature draft field.
                const keys = ['signature_status', 'feedback_remarks', 'date_checked', 'date_approved'];
                const normalize = (key,value) => key.startsWith('date_') ? stationDates.calendar(value) : sanitize(value);
                // Older requests omit dates. Preserve those dates, and include the
                // effective pair in deduplication so date-only drafts stay distinct.
                const values = keys.map(key => normalize(key,row[key] === undefined && key.startsWith('date_') ? original?.[key] : row[key]));
                if (original && values.every((value, i) => value === normalize(keys[i],original[keys[i]]))) return null;
                return [Number(row.id), ...values];
            }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    }
    function validateMatrix(changes, state) {
        const rows = changes.updatedMatrixRows;
        if (!Array.isArray(rows) || !rows.length) throw invalid('No routing changes were supplied.');
        const originals = new Map([...state.matrix, ...(state.subMatrix || [])].map(row => [Number(row.id),row]));
        const seen = new Set();
        for (const row of rows) {
            const id = Number(row.id);
            if (!Number.isSafeInteger(id) || !originals.has(id) || seen.has(id)) throw invalid('A routing station is invalid or belongs to another permit. Refresh the record.');
            if (!['Pending', 'Approved', 'Rejected'].includes(row.signature_status)) throw invalid('Invalid routing status.');
            if(row.signature_status==='Rejected' && !sanitize(row.feedback_remarks))throw invalid('Rejected stations require remarks.');
            if(sanitize(row.feedback_remarks).length>4000)throw invalid('Remarks must be within 4,000 characters.');
            if (row.date_checked !== undefined || row.date_approved !== undefined) {
                const original = originals.get(id);
                stationDates.validate(Object.fromEntries(['date_checked','date_approved'].map(key=>[key,row[key] === undefined ? stationDates.calendar(original[key]) : row[key]])));
            }
            seen.add(id);
        }
        if (changes.newHistoricalEntries !== undefined && !Array.isArray(changes.newHistoricalEntries)) throw invalid('Invalid revision history.');
    }
    async function applyChanges(conn,c,id,type,changes,current) {
            if(type==='station_dates') {
                stationDates.validate(changes);
                const row=[...current.state.matrix,...(current.state.subMatrix || [])].find(row=>Number(row.id)===Number(changes.station_id));
                if(!row)throw invalid('The station no longer exists.',409);
                await conn.query(`UPDATE ${c.matrix} SET date_checked=?,date_approved=? WHERE id=?`,[changes.date_checked || null,changes.date_approved || null,row.id]);
            } else if (type === 'permit_update') {
                // Revalidate historical requests before approval as well as new submissions.
                changes={...changes,...validation.metadata('permits',changes,sanitize,true)};
                if(changes.lot_numbers!==undefined)changes.lot_numbers=validation.lots(changes.lot_numbers,sanitize);
                const fields = ['project_title','location','owner_name','designer_name','permit_date'].filter(key => changes[key] !== undefined);
                if (fields.length) await conn.query(`UPDATE permits SET ${fields.map(key => key + ' = ?').join(', ')} WHERE id = ?`, [...fields.map(key => sanitize(changes[key])), id]);
                if (changes.lot_numbers !== undefined) {
                    if (!Array.isArray(changes.lot_numbers)) throw invalid('Invalid lot records.');
                    await conn.query('DELETE FROM permit_lots WHERE permit_id = ?', [id]);
                    for (const lot of changes.lot_numbers) await conn.query('INSERT INTO permit_lots (permit_id, lot_number) VALUES (?, ?)', [id, sanitize(lot)]);
                }
            } else {
                validateMatrix(changes, current.state);
                for (const row of changes.updatedMatrixRows) {
                    const dates = ['date_checked','date_approved'].filter(key=>row[key] !== undefined);
                    await conn.query(`UPDATE ${c.matrix} SET engineer_name = ?, signature_status = ?, feedback_remarks = ?,last_updated_by=?${dates.map(key=>', '+key+' = ?').join('')} WHERE id = ?`, [String(row.engineer_name ?? '').trim(), row.signature_status, sanitize(row.feedback_remarks), row.last_updated_by, ...dates.map(key=>row[key] || null), Number(row.id)]);
                }
                const history = decode(current.state.record.rejection_history) || [];
                const timestamp = new Date().toLocaleString('en-US',{timeZone:'Asia/Manila'});
                // Derive rejection history from authorized rows, never from client-provided history entries.
                const originals=[...current.state.matrix,...(current.state.subMatrix || [])];
                for (const row of changes.updatedMatrixRows) {
                    const original=originals.find(r=>Number(r.id)===Number(row.id));
                    if(row.signature_status==='Rejected' && original.signature_status!=='Rejected')history.push({discipline:original.discipline_name,engineer:String(row.engineer_name ?? '').trim(),reason:sanitize(row.feedback_remarks),timestamp});
                }
                await conn.query(`UPDATE ${c.records} SET rejection_history = ? WHERE id = ?`, [JSON.stringify(history), id]);
            }
    }
    // Approval is conditional on the saved baseline still matching the live project.
    // This prevents an older request from silently overwriting a newer approved change.
    function review(kind, decision) {
        const c = configs[kind];
        return (req, res) => run(res, async conn => {
            const user = await actor(conn, req, ['admin']);
            const requestId = Number(req.params.id);
            if (!Number.isSafeInteger(requestId) || requestId < 1) throw invalid('Invalid request ID.');
            const [initial] = await conn.query(`SELECT * FROM ${c.requests} WHERE id = ?`, [requestId]);
            if (!initial.length) throw invalid('Request no longer exists.', 404);
            // Always lock the parent first, then re-read the request under a lock.
            const id = initial[0][c.key];
            const current = await snapshot(conn, c, id);
            const [locked] = await conn.query(`SELECT * FROM ${c.requests} WHERE id = ? FOR UPDATE`, [requestId]);
            const request = locked[0];
            if (!request || request.status !== 'pending') throw invalid('This request has already been reviewed or is outdated. Refresh the request list.', 409);
            if (decision === 'reject') {
                await conn.query(`UPDATE ${c.requests} SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), remarks = ? WHERE id = ?`, [String(user.id), 'Rejected by administrator.', requestId]);
                return { body: { success: true, message: 'Request declined. Permit retained.' } };
            }
            if(['matrix_update','station_dates'].includes(request.change_type))throw invalid('Station edit approvals have been retired. The designated operator must save the station updates directly. This historical request has been retained.',409);
            if (!['permit_update', 'matrix_update','station_dates'].includes(request.change_type) || (kind === 'occupancy' && !['matrix_update','station_dates'].includes(request.change_type))) throw invalid('Unsupported change request.');
            const changes = decode(request.changes) || {};
            if (!changes._baseSnapshot || changes._baseSnapshot !== current.hash) {
                const message = changes._baseSnapshot ? 'Outdated request — approval blocked. This permit changed after the request was submitted. The current permit was not overwritten. Ask the operator to refresh the workspace and submit a fresh request based on its current status.' : 'This older request has no version snapshot and cannot be safely approved. Ask the operator to refresh the permit and submit a new request.';
                await conn.query(`UPDATE ${c.requests} SET status = 'conflict', reviewed_by = ?, reviewed_at = NOW(), remarks = ? WHERE id = ?`, [String(user.id), message, requestId]);
                return { status: 409, body: { success: false, conflict: true, message } };
            }
            await finalApproval.invalidate(conn,kind,id,user,current.state);
            await applyChanges(conn,c,id,request.change_type,changes,current);
            await conn.query(`UPDATE ${c.requests} SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`, [String(user.id), requestId]);
            return { body: { success: true, message: 'Changes approved and applied successfully.' } };
        });
    }
    function read(kind) {
        const c=configs[kind];
        return (req,res)=>run(res,async conn=>{
            const user=await actor(conn,req,['operator','admin']);
            const current=await snapshot(conn,c,Number(req.params.id));
            const state=current.state;
            const assigned=await stationAccess.assignments(conn,user.id),allowed=new Set(assigned.map(station=>station.station_key));
            const operators=await stationAccess.engineers(conn,[...state.matrix,...(state.subMatrix || [])]);
            const reviews=await finalApproval.reviewHistory(conn,kind,Number(req.params.id));
            const calendarRow=row=>{
                const copy={...row};
                for(const key of ['permit_date','date_applied','date_checked','date_approved'])if(copy[key]!=null)copy[key]=stationDates.calendar(copy[key]);
                if(copy.discipline_name!==undefined){copy.can_edit=allowed.has(stationAccess.key(copy.discipline_name));return stationAccess.engineer(copy,operators);}
                return copy;
            };
            const body={...calendarRow(state.record),matrix:state.matrix.map(calendarRow),_version:current.hash,_signatureDatesSupported:true,_stationAccessSupported:true,_assignedEngineerProfileSupported:true,assigned_stations:assigned.map(station=>station.station_name),assigned_station:assigned[0]?.station_name || null,final_approval:finalApproval.summary(state,reviews)};
            if(kind==='occupancy'){body._standardOccupancyStationsSupported=true;body.standard_stations=[...occupancyStations.defaults];}
            if(kind==='permits') {
                body._standardBuildingStationsSupported=true;body.standard_stations=[...buildingStations.defaults];
                body.lot_numbers=state.lots.map(row=>row.lot_number);
                body.sub_permits=state.subs.map(sub=>({...sub,matrix:state.subMatrix.filter(row=>Number(row.sub_permit_id)===Number(sub.id)).map(calendarRow)}));
            }
            return {body};
        });
    }
    function routing(kind,remove=false) {
        const c=configs[kind];
        return (req,res)=>run(res,async conn=>{
            // Admin station management follows assignments too; registry access
            // must not expose unrestricted station creation or removal.
            const user=await actor(conn,req,remove?['admin']:['operator','admin']);
            const input=remove?req.query:req.body;
            const subId=kind==='permits' && input.sub_permit_id?Number(input.sub_permit_id):null;
            let id=Number(input[c.key]);
            if(subId) {
                if(input.permit_id)throw invalid('Choose one routing target.');
                const [subs]=await conn.query('SELECT permit_id FROM sub_permits WHERE id=?',[subId]);
                id=Number(subs[0]?.permit_id);
            }
            if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid routing target.');
            const current=await snapshot(conn,c,id);requireVersion(req,current.hash);
            if(subId && !current.state.subs.some(row=>Number(row.id)===subId))throw invalid('Sub-permit no longer exists.',404);
            const name=sanitize(input.discipline_name);if(!name)throw invalid('Station name is required.');
            if(user.role==='admin')await stationAccess.authorize(conn,user,[{discipline_name:name}]);
            const column=subId?'sub_permit_id':c.key, target=subId||id;
            const [existing]=await conn.query('SELECT id FROM '+c.matrix+' WHERE '+column+'=? AND discipline_name=?',[target,name]);
            const targetRows=subId?current.state.subMatrix.filter(row=>Number(row.sub_permit_id)===subId):current.state.matrix;
            if(!remove && targetRows.some(row=>stationAccess.key(row.discipline_name)===stationAccess.key(name)))throw invalid('This station is already assigned.',409);
            await finalApproval.invalidate(conn,kind,id,user,current.state);
            if(remove) {
                if(!existing.length)throw invalid('This station no longer exists.',409);
                await conn.query('DELETE FROM '+c.matrix+' WHERE '+column+'=? AND discipline_name=?',[target,name]);
            } else {
                if(existing.length)throw invalid('This station is already assigned.',409);
                await conn.query('INSERT INTO '+c.matrix+' ('+column+',discipline_name,engineer_name,signature_status,feedback_remarks) VALUES (?, ?, ?, ?, ?)',[target,name,'','Pending','']);
            }
            return {body:{success:true,message:remove?'Station removed.':'Station added.',_version:(await snapshot(conn,c,id)).hash}};
        });
    }
    function initializeOccupancyStations() {
        const c=configs.occupancy;
        return (req,res)=>run(res,async conn=>{
            const user=await actor(conn,req,['operator']),id=Number(req.params.id);
            if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid occupancy project ID.');
            const current=await snapshot(conn,c,id);requireVersion(req,current.hash);
            if(current.state.matrix.length)return {body:{success:true,unchanged:true,message:'This project already has routing stations.',_version:current.hash}};
            await finalApproval.invalidate(conn,'occupancy',id,user,current.state);
            await occupancyStations.seed(conn,id);
            res.locals=res.locals || {};
            res.locals.projectChangeDetail=JSON.stringify({version:1,changes:occupancyStations.defaults.map(name=>({field:'Routing station',before:'',after:name+' · Pending'}))});
            return {body:{success:true,message:'Standard occupancy stations added.',_version:(await snapshot(conn,c,id)).hash}};
        });
    }
    function initializeBuildingStations() {
        const c=configs.permits;
        return (req,res)=>run(res,async conn=>{
            const user=await actor(conn,req,['operator']),id=Number(req.params.id);
            if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid building project ID.');
            const current=await snapshot(conn,c,id);requireVersion(req,current.hash);
            const targets=[];
            if(!current.state.matrix.length)targets.push({subId:null,label:'Main permit'});
            for(const sub of current.state.subs)if(!current.state.subMatrix.some(row=>Number(row.sub_permit_id)===Number(sub.id)))targets.push({subId:Number(sub.id),label:'Sub: '+sub.sub_project_title});
            if(!targets.length)return {body:{success:true,unchanged:true,message:'This project already has routing stations.',_version:current.hash}};
            await finalApproval.invalidate(conn,'permits',id,user,current.state);
            for(const target of targets)await buildingStations.seed(conn,id,target.subId);
            res.locals=res.locals || {};
            res.locals.projectChangeDetail=JSON.stringify({version:1,changes:targets.flatMap(target=>buildingStations.defaults.map(name=>({field:target.label+' routing station',before:'',after:name+' · Pending'})))});
            return {body:{success:true,message:'Standard building stations added.',_version:(await snapshot(conn,c,id)).hash}};
        });
    }
    function finalReview(kind) {
        const c=configs[kind];
        return (req,res)=>run(res,async conn=>{
            const user=await actor(conn,req,['admin']),id=Number(req.params.id);
            if(!Number.isSafeInteger(id)||id<1)throw invalid('Invalid project ID.');
            const current=await snapshot(conn,c,id);requireVersion(req,current.hash);
            const [reviews]=await conn.query('SELECT * FROM permit_final_reviews WHERE kind=? AND project_id=? ORDER BY id DESC'+finalHistoryLock(conn),[kind,id]);
            const status=finalApproval.summary(current.state,reviews),decision=req.body.decision;
            const remarks=sanitize(req.body.remarks);
            if(!['approved','returned'].includes(decision))throw invalid('Choose final approval or return for correction.');
            if(decision==='returned' && status.status==='approved')throw invalid('This project is already finally approved. A new review is available only after project or station details change.',409);
            if(remarks.length>4000 || (decision==='returned' && !remarks))throw invalid('Returning a project requires correction remarks (up to 4,000 characters).');
            if(decision==='approved' && status.status==='approved')return {body:{success:true,unchanged:true,message:'This project is already finally approved.'}};
            if(decision==='approved' && !status.ready)throw invalid('Every required station must be approved and any returned corrections saved before final approval.',409);
            if(decision==='returned' && reviews[0]?.decision==='returned' && reviews[0].snapshot_hash===finalApproval.fingerprint(current.state) && reviews[0].remarks===remarks)return {body:{success:true,unchanged:true}};
            const operators=await stationAccess.engineers(conn,[...current.state.matrix,...(current.state.subMatrix || [])]);
            const reviewedEngineers=[...current.state.matrix,...(current.state.subMatrix || [])].map(row=>{const live=stationAccess.engineer(row,operators);return {station_id:Number(row.id),operator_id:live.reviewing_operator_id || live.assigned_operator_id,display_name:live.engineer_name};});
            const reviewSnapshot={...current.state,reviewed_engineers:reviewedEngineers};
            await conn.query('INSERT INTO permit_final_reviews (kind,project_id,decision,reviewer_id,reviewer_name,remarks,snapshot_hash,snapshot) VALUES (?,?,?,?,?,?,?,?)',[kind,id,decision,user.id,await stationAccess.displayName(conn,user),remarks,finalApproval.fingerprint(current.state),JSON.stringify(reviewSnapshot)]);
            return {body:{success:true,message:decision==='approved'?'Project finally approved.':'Project returned for correction.'}};
        });
    }
    return { submit, review, read, routing, finalReview, initializeOccupancyStations, initializeBuildingStations, snapshot, configs };
};
