/**
 * MAINTAINER GUIDE
 * Progressive layout enhancement for the building workspace template disclosure.
 * Moves existing nodes rather than copying them so their IDs and event handlers keep working. Normal document scrolling is intentionally retained.
 */
/* Layout enhancement only; existing station and template handlers retain ownership. */
(() => {
    const sidebar = document.querySelector('.left-col');
    const grid = document.querySelector('.main-grid');
    if (!sidebar || !grid) return;

    const templates = document.getElementById('quickAddTemplates');
    if (templates) {
        const heading = templates.previousElementSibling;
        const disclosure = document.createElement('details');
        disclosure.className = 'workspace-template-disclosure';
        disclosure.open = true;
        const summary = document.createElement('summary');
        summary.textContent = 'Quick Add Templates';
        disclosure.append(summary);
        heading.before(disclosure);
        const label = heading.querySelector('.quick-add-label');
        if (label) label.hidden = true;
        for (const node of [heading, templates, document.getElementById('templateEditor'), document.getElementById('templateFeedback')]) {
            if (node) disclosure.append(node);
        }
    }

})();
