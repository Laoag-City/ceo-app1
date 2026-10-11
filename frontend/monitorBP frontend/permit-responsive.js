/** Presentation only: mobile table labels follow the live column headings.
 * Keep the original cells and controls so editors retain their state and events.
 */
(() => {
    const selector = '.registry-card table,.matrix-table-wrap table,.data-region table,.fr-table table';
    function enhance() {
        document.querySelectorAll(selector).forEach(table => {
            const headings = Array.from(table.tHead?.rows[0]?.cells || []);
            if (!headings.length) return;
            table.classList.add('permit-mobile-table');
            table.setAttribute('role', 'table');
            headings.forEach(cell => cell.setAttribute('role', 'columnheader'));
            for (const body of table.tBodies) for (const row of body.rows) {
                row.setAttribute('role', 'row');
                let column = 0;
                for (const cell of row.cells) {
                    cell.setAttribute('role', 'cell');
                    if (cell.colSpan === 1) {
                        const label = headings[column]?.textContent.trim().replace(/\s+/g, ' ') || '';
                        cell.dataset.label = label;
                        cell.dataset.field = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    }
                    column += cell.colSpan;
                }
            }
        });
    }
    function start() {
        let scheduled = false;
        const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; enhance(); });
        });
        observer.observe(document.body, {childList:true, subtree:true});
        enhance();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
    else start();
})();
