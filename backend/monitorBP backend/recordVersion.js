// Opaque versions describe the data the editor actually loaded. Never fetch a
// replacement version immediately before saving: that would authorize a stale draft.
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requireVersion(req,current) {
    const expected=req.get?.('x-record-version');
    if(!expected || expected!==current)throw Object.assign(new Error((expected?'This record was updated by another user.':'This page needs to be reloaded before saving.')+' Your changes have not been saved. Copy your unsaved inputs before refreshing to review the latest record.'),{status:409,conflict:true});
}
module.exports={hash,requireVersion};
