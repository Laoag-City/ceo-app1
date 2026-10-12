const fs = require('node:fs/promises');
const path = require('node:path');

function cloudVideoURL(reference) {
    try {
        const url = new URL(reference);
        if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
            !url.username && !url.password && !url.search && !url.hash &&
            /^\/[^/]+\/video\/upload\//.test(url.pathname)) return url.href;
    } catch {}
    return null;
}

function localVideoPath(reference, directory) {
    if (typeof reference !== 'string' || !/^uploads\/[^/\\:]+$/.test(reference)) return null;
    const name = reference.slice(8);
    if (name === '.' || name === '..') return null;
    const file = path.resolve(directory, name);
    return path.dirname(file) === path.resolve(directory) ? file : null;
}

// Only original, untransformed upload URLs from our configured cloud may be
// destroyed. Other clouds and unusual legacy URLs remain read-only references.
function cloudVideoId(reference, cloudName) {
    const safe=cloudVideoURL(reference);
    if(!safe || !cloudName)return null;
    const parts=new URL(safe).pathname.split('/');
    if(parts[1]!==cloudName)return null;
    const suffix=parts.slice(4);
    if(/^v\d+$/.test(suffix[0]))suffix.shift();
    try {
        const id=decodeURIComponent(suffix.join('/')).replace(/\.(mp4|webm|mov|m4v)$/i,'');
        if(!/\.(mp4|webm|mov|m4v)$/i.test(suffix.join('/')) ||
            !id || id.split('/').some(part=>!part || part==='.' || part==='..') ||
            /[\\,:?#%\x00-\x1f\x7f]/.test(id))return null;
        return id;
    } catch {return null;}
}

module.exports = function createVideoStorage(db, directory, env = process.env, sdk, fallbackDirectories = []) {
    const mode = env.QUEUE_VIDEO_STORAGE || 'local';
    if (!['local', 'cloudinary'].includes(mode)) throw Error('QUEUE_VIDEO_STORAGE must be local or cloudinary.');
    let uploader, credentials;
    if (mode === 'cloudinary') {
        if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)
            throw Error('Cloudinary video storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
        uploader = (sdk || require('cloudinary').v2).uploader;
        credentials = {cloud_name:env.CLOUDINARY_CLOUD_NAME, api_key:env.CLOUDINARY_API_KEY, api_secret:env.CLOUDINARY_API_SECRET};
    }

    async function playableURL(reference) {
        const remote = cloudVideoURL(reference);
        if (remote) return remote;
        // Express serves the current upload folder first, then original local
        // media. Match that lookup so a working old video stays in the playlist.
        for (const folder of [directory, ...fallbackDirectories]) {
            const local = localVideoPath(reference, folder);
            if (!local) return null;
            try { if ((await fs.stat(local)).isFile()) return '/' + reference; } catch {}
        }
        return null;
    }

    async function playlist() {
        const [rows] = await db.query('SELECT filepath FROM videos WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
        const items = await Promise.all(rows.map(row => playableURL(row.filepath)));
        return items.filter(Boolean);
    }

    async function list() {
        const [rows] = await db.query('SELECT id, filename, filepath, uploaded_at, is_active, sort_order FROM videos ORDER BY sort_order ASC, id ASC');
        return Promise.all(rows.map(async row => {
            const url = await playableURL(row.filepath);
            const date = new Date(row.uploaded_at);
            return {id:Number(row.id), name:row.filename, active:Number(row.is_active) === 1,
                uploadedAt:row.uploaded_at && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
                url, available:!!url};
        }));
    }

    // Uploads and reorder requests share a database-owned lock. Concurrent staff
    // requests cannot append to the same position or overwrite another reorder.
    async function edit(work) {
        const conn = await db.getConnection();
        let locked = false;
        const lockName = 'queue_system:video-playlist';
        try {
            if (conn.dialect === 'postgres') {
                await conn.beginTransaction();
                await conn.query('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', [lockName]);
            } else {
                const [[result]] = await conn.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
                if (Number(result.acquired) !== 1) throw Object.assign(Error('The playlist is busy. Try again.'), {status:409});
                locked = true;
                await conn.beginTransaction();
            }
            const result = await work(conn);
            await conn.commit();
            return result;
        } catch (error) {
            try { await conn.rollback(); } catch {}
            throw error;
        } finally {
            try { if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]); }
            finally { conn.release(); }
        }
    }

    async function setActive(id, active) {
        return edit(async conn => {
            const [[row]] = await conn.query('SELECT id, filename FROM videos WHERE id = ? FOR UPDATE', [id]);
            if (!row) throw Object.assign(Error('That video no longer exists. Refresh the playlist.'), {status:404});
            await conn.query('UPDATE videos SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
            return row.filename;
        });
    }

    async function move(id, direction) {
        return edit(async conn => {
            const [rows] = await conn.query('SELECT id, filename FROM videos ORDER BY sort_order ASC, id ASC FOR UPDATE');
            const from = rows.findIndex(row => Number(row.id) === id);
            if (from < 0) throw Object.assign(Error('That video no longer exists. Refresh the playlist.'), {status:404});
            const to = from + (direction === 'up' ? -1 : 1);
            if (to < 0 || to >= rows.length) return {name:rows[from].filename, changed:false};
            const name = rows[from].filename;
            [rows[from], rows[to]] = [rows[to], rows[from]];
            // Normalize old positions too, including disabled videos, so toggling
            // a clip later restores its chosen position in the same playlist.
            for (let index = 0; index < rows.length; index++) {
                await conn.query('UPDATE videos SET sort_order = ? WHERE id = ?', [index + 1, rows[index].id]);
            }
            return {name, changed:true};
        });
    }

    async function remove(id) {
        const video=await edit(async conn => {
            const [[row]]=await conn.query('SELECT id, filename, filepath FROM videos WHERE id = ? FOR UPDATE',[id]);
            if(!row)throw Object.assign(Error('That video no longer exists. Refresh the playlist.'),{status:404});
            await conn.query('DELETE FROM videos WHERE id = ?',[id]);
            const [[remaining]]=await conn.query('SELECT COUNT(*) AS reference_count FROM videos WHERE filepath = ?',[row.filepath]);
            return {...row,shared:Number(remaining.reference_count)>0};
        });
        let cleanupPending=false;
        // The playlist change has committed. A storage outage must not falsely
        // report it as unsaved, or invite another destructive retry.
        if(!video.shared) {
            try {
                if(cloudVideoURL(video.filepath)) {
                    const publicId=cloudVideoId(video.filepath,env.CLOUDINARY_CLOUD_NAME);
                    if(mode!=='cloudinary' || !publicId)cleanupPending=true;
                    else {
                        const result=await uploader.destroy(publicId,{...credentials,resource_type:'video',invalidate:true});
                        if(!['ok','not found'].includes(result?.result))cleanupPending=true;
                    }
                } else {
                    for(const folder of [directory,...fallbackDirectories]) {
                        const file=localVideoPath(video.filepath,folder);
                        if(!file) {cleanupPending=true;break;}
                        try {
                            const [actualFolder,actualFile]=await Promise.all([fs.realpath(folder),fs.realpath(file)]);
                            if(path.dirname(actualFile)!==actualFolder || !(await fs.lstat(file)).isFile()) {cleanupPending=true;continue;}
                            await fs.unlink(file);
                        } catch(error) {if(error.code!=='ENOENT')throw error;}
                    }
                }
            } catch {cleanupPending=true;}
        }
        return {name:video.filename,cleanupPending};
    }

    async function save(file) {
        let remote, saved = false;
        try {
            let reference = 'uploads/' + file.filename;
            if (mode === 'cloudinary') {
                remote = await uploader.upload(file.path, {...credentials, resource_type:'video',
                    folder:'ojt-queue-videos', overwrite:false, allowed_formats:['mp4','webm','mov','m4v'], timeout:90000});
                reference = cloudVideoURL(remote.secure_url);
                if (!reference || reference.length > 255) throw Error('Unsupported video storage response.');
            }
            await edit(async conn => {
                const [[row]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) AS last_order FROM videos');
                const next = Number(row.last_order) + 1;
                if (!Number.isSafeInteger(next)) throw Error('Playlist position limit reached.');
                await conn.query('INSERT INTO videos (filename, filepath, is_active, sort_order) VALUES (?, ?, 1, ?)', [file.originalname, reference, next]);
            });
            saved = true;
            return reference;
        } catch (error) {
            // A failed database insert must not leave a new unreferenced cloud asset.
            if (remote?.public_id) {
                try { await uploader.destroy(remote.public_id, {...credentials, resource_type:'video'}); }
                catch { console.error('Could not clean up an unsaved cloud video. Check the Cloudinary media library.'); }
            }
            throw error;
        } finally {
            if (mode === 'cloudinary' || !saved) {
                try { await fs.unlink(file.path); } catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove a temporary video upload.'); }
            }
        }
    }
    return {save, playlist, list, move, setActive, remove, mode};
};
module.exports.cloudVideoURL = cloudVideoURL;
module.exports.localVideoPath = localVideoPath;
module.exports.cloudVideoId = cloudVideoId;
