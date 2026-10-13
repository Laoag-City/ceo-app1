const path = require('node:path');
module.exports = function permitPages(frontendPath, sessions) {
// Serve protected HTML only after session/role checks. Inject the verified UI
// identity before legacy controllers run; sessionStorage is never authority.
const pagePolicy = {
    '/index.html':['index.html','operator'],
    '/edit':['edit.html','operator'], '/edit.html':['edit.html','operator'],
    '/occupancy':['occupancy.html','operator'], '/occupancy.html':['occupancy.html','operator'],
    '/occupancy/edit':['occupancy_edit.html','operator'], '/occupancy_edit.html':['occupancy_edit.html','operator'],
    '/admin':['superadmin.html','admin'], '/admin.html':['superadmin.html','admin'],
    '/superadmin':['superadmin.html','superadmin'], '/superadmin.html':['superadmin.html','superadmin']
};
return (req,res,next)=>{
    let pagePath;
    try { pagePath=path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g,'/')).toLowerCase().replace(/\/$/,'') || '/'; }
    catch { return res.status(400).send('Invalid page URL.'); }
    // The public landing page must be handled before express.static can serve
    // its default index.html, which is the protected Building registry.
    if(pagePath==='/') return res.redirect('/portal.html');
    const homes={operator:'/index.html',admin:'/admin',superadmin:'/superadmin'};
    // Retired chooser URL remains a role-aware redirect for saved bookmarks.
    if(pagePath==='/permit-access.html') {
        res.set('Cache-Control','no-store');
        return res.redirect(homes[req.user?.role] || '/login');
    }
    const policy=pagePolicy[pagePath];
    if(!policy) return next();
    res.set('Cache-Control','no-store');
    if(!req.user) {
        // A revoked cookie is a one-time explanation, not a permanent login URL.
        // Only clear it on a protected-page redirect; valid sessions stay intact.
        sessions?.clearCookie(res);
        return res.redirect(req.sessionReplaced ? '/login?session=replaced' : '/login');
    }

    if(req.user.role!==policy[1]) return res.redirect(homes[req.user.role]);
    const identity=JSON.stringify(JSON.stringify(req.user)).replace(/</g,'\\u003c');
    require('fs').readFile(path.join(frontendPath,policy[0]),'utf8',(error,html)=>{
        if(error) return next(error);
        res.type('html').send(html.replace('<head>','<head><script>sessionStorage.setItem("oboUser",'+identity+');</script>'));
    });
};
};
