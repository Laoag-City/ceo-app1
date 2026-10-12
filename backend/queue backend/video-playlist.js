/** Staff playlist controls. Public monitors receive only enabled, playable URLs. */
async function ensureVideoSchema(db) {
    if (db.dialect === 'postgres') {
        // PostgreSQL runtime roles validate owner-managed migrations only.
        await db.query('SELECT id, filename, filepath, uploaded_at, is_active, sort_order FROM videos LIMIT 0');
        return;
    }
    const [columns] = await db.query("SHOW COLUMNS FROM videos LIKE 'sort_order'");
    if (!columns.length) {
        await db.query('ALTER TABLE videos ADD COLUMN sort_order INT NOT NULL DEFAULT 0');
        await db.query('UPDATE videos SET sort_order = id');
    }
}

function registerVideoPlaylist(app, {storage, sessions, protectWrite, receiveVideo, writeLog, io, displayName}) {
    const staff = sessions.requireRoles('operator', 'admin', 'superadmin');
    const noStore = (req, res, next) => {res.set('Cache-Control', 'no-store'); next();};
    async function actor(user) {
        let name = user.display_name;
        if (!name && displayName) {
            try { name = await displayName(user); } catch {}
        }
        return String(name || '').trim() || user.username;
    }
    let announcements = Promise.resolve();
    function announce() {
        // Keep the read and emit together in arrival order. A slow local file
        // check must not emit its older snapshot after a later disable update.
        const next = announcements.then(async () => {
            // Saved changes remain successful if a display refresh fails.
            // Monitors fetch the current playlist again on reconnect.
            try {
                const playlist = await storage.playlist();
                io.emit('playlistUpdate', {playlist});
                return playlist;
            } catch { return null; }
        });
        announcements = next.then(() => undefined, () => undefined);
        return next;
    }
    function audit(name, action, details) {
        const characters = Array.from(name);
        // The existing station field holds 50 characters. Keep the full actor
        // in details when a profile display name or username exceeds that width.
        return writeLog(characters.slice(0, 50).join(''), action,
            characters.length > 50 ? `Staff member: ${name}. ${details}` : details);
    }
    function idFrom(req) {
        const raw = req.params.id;
        if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
            throw Object.assign(Error('Choose a valid video.'), {status:400});
        }
        return Number(raw);
    }
    function errorResponse(res, error, fallback) {
        return res.status(error.status || 500).json({success:false, message:error.status ? error.message : fallback});
    }

    app.get('/api/videos/manage', noStore, staff, async (req, res) => {
        try {
            const [videos, name] = await Promise.all([storage.list(), actor(req.user)]);
            res.json({success:true, videos, user:{displayName:name, role:req.user.role}});
        } catch (error) { errorResponse(res, error, 'The playlist could not be loaded. Try Refresh.'); }
    });

    app.post('/api/videos/upload', noStore, protectWrite, staff, receiveVideo, async (req, res) => {
        if (!req.file) return res.status(400).json({success:false, message:'Choose a video to upload.'});
        try {
            const name = await actor(req.user);
            await storage.save(req.file);
            await audit(name, 'VIDEO_UPLOAD', `Uploaded video "${req.file.originalname}" to the end of the monitor playlist.`);
            res.json({success:true, playlist:await announce()});
        } catch (error) {
            res.status(error.status || 502).json({success:false, message:error.status ? error.message : 'Video storage could not complete the upload. Check the storage settings and try again.'});
        }
    });

    app.get('/api/videos/playlist', noStore, async (req, res) => {
        try { res.json({success:true, playlist:await storage.playlist()}); }
        catch (error) { errorResponse(res, error, 'The video playlist could not be loaded.'); }
    });

    app.post('/api/videos/:id/active', noStore, protectWrite, staff, async (req, res) => {
        try {
            if (!req.body || Object.keys(req.body).some(key => key !== 'active') || typeof req.body.active !== 'boolean') {
                throw Object.assign(Error('Choose whether to enable or disable this video.'), {status:400});
            }
            const name = await actor(req.user);
            const video = await storage.setActive(idFrom(req), req.body.active);
            await audit(name, req.body.active ? 'VIDEO_ENABLE' : 'VIDEO_DISABLE', `${req.body.active ? 'Enabled' : 'Disabled'} video "${video}" in the monitor playlist.`);
            res.json({success:true, playlist:await announce()});
        } catch (error) { errorResponse(res, error, 'The video could not be updated. Refresh and try again.'); }
    });

    app.post('/api/videos/:id/move', noStore, protectWrite, staff, async (req, res) => {
        try {
            if (!req.body || Object.keys(req.body).some(key => key !== 'direction') || !['up', 'down'].includes(req.body.direction)) {
                throw Object.assign(Error('Choose Up or Down to move the video.'), {status:400});
            }
            const name = await actor(req.user);
            const video = await storage.move(idFrom(req), req.body.direction);
            if (video.changed) await audit(name, 'VIDEO_REORDER', `Moved video "${video.name}" ${req.body.direction} in the monitor playlist.`);
            res.json({success:true, playlist:video.changed ? await announce() : null});
        } catch (error) { errorResponse(res, error, 'The video could not be moved. Refresh and try again.'); }
    });

    app.delete('/api/videos/:id', noStore, protectWrite, staff, async (req,res) => {
        try {
            const name=await actor(req.user);
            const video=await storage.remove(idFrom(req));
            await audit(name,'VIDEO_DELETE',`Deleted video "${video.name}" from the monitor playlist.`+
                (video.cleanupPending ? ' Stored-file cleanup still requires attention.' : ''));
            res.json({success:true,cleanupPending:video.cleanupPending,playlist:await announce()});
        } catch(error) {errorResponse(res,error,'The video could not be deleted. Refresh and try again.');}
    });
}

module.exports = {registerVideoPlaylist, ensureVideoSchema};
