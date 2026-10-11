const crypto = require('node:crypto');
const {tasks} = require('./queue-services');
const tokenHash = req => {
    const prefix=(process.env.QUEUE_COOKIE_NAME || 'queue_session')+'=';
    const token=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(prefix))?.slice(prefix.length);
    return /^[a-f0-9]{64}$/.test(token || '') ? crypto.createHash('sha256').update(token).digest('hex') : null;
};
// Three server-owned leases, one per service window. Restart requires reclaiming
// windows; sessions survive. Never authorize using sessionStorage or body roles.
module.exports = function queueAuth(sessions, ownerActive) {
    const leases=new Map();
    const deny=(res,status,message)=>res.status(status).json({success:false,allowed:false,message});
    function protectWrite(req,res,next) {
        const origin=req.get('origin');
        const expected=process.env.QUEUE_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
        if(req.get('x-queue-request')!=='1' || (origin && origin!==expected) || req.get('sec-fetch-site')==='cross-site')return deny(res,403,'Open the queue system directly and try again.');
        next();
    }
    async function claim(req,res) {
        const workspace=req.body?.workspace;
        if(!Object.hasOwn(tasks,workspace))return deny(res,400,'Choose a valid service window.');
        const owner=tokenHash(req);
        if(!owner)return deny(res,401,'Please sign in again.');
        try {
            const previous=leases.get(workspace);
            if(previous && previous!==owner) {
                if(await ownerActive(previous))return deny(res,409,'This window is already assigned to another signed-in session.');
                // A concurrent claim must not replace a newly assigned owner.
                if(leases.get(workspace)!==previous)return deny(res,409,'Window assignment changed. Try again.');
            }
            leases.set(workspace,owner);
            res.json({success:true,allowed:true,workspace,user:req.user});
        }catch(error){return deny(res,503,'Could not verify window ownership. Please try again.');}
    }
    function requireWindow(req,res,next) {
        sessions.requireRoles('operator','admin','superadmin')(req,res,()=>{
            const workspace=req.body?.workspace || req.query?.workspace;
            if(!Object.hasOwn(tasks,workspace))return deny(res,403,'This action requires a service window.');
            if(leases.get(workspace)!==tokenHash(req))return deny(res,409,'Your window session ended or changed. Return to workstation selection and sign in again.');
            req.queueWorkspace=workspace;req.queueReasons=tasks[workspace];
            next();
        });
    }
    function release(req,res){leases.delete(req.queueWorkspace);res.json({success:true});}
    return {protectWrite,claim,requireWindow,release,clear:()=>leases.clear()};
};
