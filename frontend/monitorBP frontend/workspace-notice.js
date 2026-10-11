// Shared, manually dismissible pending-review notice for both workspaces.
function showPendingToast(message) {
    let notice = document.getElementById('pendingToast');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'pendingToast';
        document.body.appendChild(notice);
    }
    window.renderLoginFeedback(notice, 'Pending approval — ' + message, true);
    notice.setAttribute('role', 'status');
}
