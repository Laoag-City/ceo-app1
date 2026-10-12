const express=require('express');

// The workspace writes belong to operators; administrators review requests.
module.exports=function inspectionRoutes(workflow,sessions) {
    const router=express.Router({mergeParams:true});
    router.get('/',workflow.readInspections);
    router.post('/',sessions.requireRoles('operator'),workflow.save());
    router.put('/:inspId',sessions.requireRoles('operator'),workflow.save(true));
    router.delete('/:inspId',sessions.requireRoles('operator'),workflow.submit);
    return router;
};
