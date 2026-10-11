/** Read-only station remarks, shared by registry progress and routing tables. */
(() => {
    let dialog, trigger;
    function getDialog() {
        if (dialog) return dialog;
        dialog = document.createElement('dialog');
        dialog.id = 'stationRemarksDialog';
        dialog.setAttribute('aria-labelledby', 'stationRemarksStation');
        dialog.innerHTML = `
            <header class="remarks-viewer-header">
                <div><p class="remarks-viewer-eyebrow">Station remarks</p><h2 id="stationRemarksStation"></h2></div>
                <button type="button" class="remarks-viewer-close" aria-label="Close remarks" autofocus>×</button>
            </header>
            <div class="remarks-viewer-body" tabindex="0" aria-label="Full remarks"><p id="stationRemarksText"></p></div>
            <footer class="remarks-viewer-footer"><button type="button" class="remarks-viewer-done">Close</button></footer>`;
        dialog.querySelectorAll('button').forEach(button => button.addEventListener('click', () => dialog.close()));
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        });
        // Escape belongs to this popup, including when opened over progress.
        dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
        dialog.addEventListener('close', () => { if (trigger?.isConnected) trigger.focus({preventScroll:true}); });
        document.body.append(dialog);
        return dialog;
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-station-remarks]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        trigger = button;
        const popup = getDialog();
        popup.querySelector('#stationRemarksStation').textContent = button.dataset.remarksStation || 'Station';
        popup.querySelector('#stationRemarksText').textContent = button.dataset.remarksText || '';
        popup.querySelector('.remarks-viewer-body').scrollTop = 0;
        if (!popup.open) popup.showModal();
    });
})();
