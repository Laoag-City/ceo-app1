/* Presentation only: actions delegate to the existing guarded review workflow. */
function renderAdminRequestCard(request, kind) {
    const building = kind === 'permits';
    const id = Number(request.id);
    if (!Number.isSafeInteger(id) || id <= 0) return '';
    const bulk = request.change_type === 'bulk_delete';
    const deletion = ['delete','inspection_delete','bulk_delete'].includes(request.change_type);
    const action = bulk ? 'Delete all permit records' : request.change_type === 'inspection_delete' ? 'Delete inspection' : request.change_type === 'station_dates' ? 'Station dates' : deletion ? 'Delete permit' : request.change_type === 'matrix_update' ? 'Routing update' : request.change_type === 'permit_update' ? 'Permit details update' : 'Permit update';
    const approve = building ? 'approvePermitRequest' : 'approveOccupancyRequest';
    const decline = building ? 'rejectPermitRequest' : 'rejectOccupancyRequest';
    const project = request.project_title || (building ? 'Permit ' + request.permit_id : 'Occupancy ' + request.occupancy_id);
    return `<article class="review-request ${building ? 'building-request' : 'occupancy-request'}${deletion ? ' deletion-request' : ''}">
        <div class="request-emblem permit-symbol ${building ? 'building-symbol' : 'occupancy-symbol'}" aria-hidden="true"></div>
        <div class="request-content">
        <h3>${approvalEscape(project)}</h3>
        <p class="request-author"><strong>${approvalEscape(request.requested_by_name || 'Unknown requester')}</strong> is requesting approval</p>
        <div class="request-meta"><span class="request-kind">${action}</span><span>Request #${id}</span></div>
        <div class="request-change-preview">${renderApprovalChanges(request, { compact: true })}</div>
        <div class="review-request-footer">
            <div class="request-actions">
                <button type="button" class="btn approve" onclick="${approve}(${id}, ${deletion}, ${bulk})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Approve${deletion ? ' deletion' : ''}</button>
                <button type="button" class="btn reject" onclick="${decline}(${id}, ${bulk})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>Decline</button>
            </div>
            <span class="review-note">${deletion ? 'Permanent action' : 'Pending review'}</span>
        </div>
        </div>
    </article>`;
}
