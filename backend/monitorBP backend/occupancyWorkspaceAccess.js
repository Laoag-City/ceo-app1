// Opening the registry does not grant admin access to operator-only CRUD.
// Station endpoints still verify live assignments in editWorkflow.
module.exports = function occupancyWorkspaceAccess(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.path.startsWith('/change-requests/') || /\/final-review$/.test(req.path)) return next();
    const role = (req.user?.role || '').toLowerCase();
    if (role === 'operator') return next();
    if (role === 'admin' && req.method === 'PUT' && /^\/\d+\/signatures\/?$/.test(req.path)) return next();
    return res.status(403).json({ success: false, message: 'Only operators can change occupancy records. Admins may update their assigned stations and review requests.' });
};
