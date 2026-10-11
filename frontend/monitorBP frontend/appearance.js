/**
 * MAINTAINER GUIDE
 * Shared light/dark preference applied before page content loads.
 * The engineeringTheme cookie and browser storage synchronize the local application surfaces. Keep this script early in the document to reduce theme flashing.
 */
(() => {
    const key = 'engineeringTheme';
    const root = document.documentElement;
    function readTheme() {
        try {
            const cookie = document.cookie.split('; ').find(item => item.startsWith(key + '='));
            if (cookie && /^(dark|light)$/.test(cookie.split('=')[1])) return cookie.split('=')[1];
            const stored = localStorage.getItem(key) || localStorage.getItem('engineeringPortalTheme');
            if (stored === 'dark' || stored === 'light') return stored;
        } catch {}
        return 'light';
    }
    let transitionTimer;
    function apply(theme) {
        // Animate preference changes only; apply the initial theme immediately.
        if (root.dataset.theme && root.dataset.theme !== theme &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            clearTimeout(transitionTimer);
            root.classList.add('theme-transitioning');
            // Commit the previous colors before changing the theme attributes.
            if (document.body) getComputedStyle(document.body).backgroundColor;
            transitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), 460);
        }
        root.dataset.theme = theme;
        root.dataset.portalTheme = theme;
        const button = document.getElementById('appearanceToggle');
        if (button) {
            const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            button.setAttribute('aria-pressed', String(theme === 'dark'));
        }
    }
    function remember(theme) {
        // A preference cookie shares the choice between the two localhost ports.
        try { document.cookie = key + '=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax'; } catch {}
        try { localStorage.setItem(key, theme); localStorage.setItem('engineeringPortalTheme', theme); } catch {}
    }
    apply(readTheme());
    remember(root.dataset.theme);
    function mount() {
        const header = document.querySelector('.site-header');
        if (!header || document.getElementById('appearanceToggle')) return;
        let actions = header.querySelector('.top-bar-actions,.top-bar-controls');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'theme-header-actions';
            for (const child of Array.from(header.children)) {
                if (child.matches('.header-logout,.station-chip,.header-context')) actions.appendChild(child);
            }
            header.appendChild(actions);
        }
        const button = document.createElement('button');
        button.id = 'appearanceToggle';
        button.className = 'theme-switch';
        button.type = 'button';
        button.innerHTML = '<svg class="appearance-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg><svg class="appearance-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
        button.addEventListener('click', () => {
            const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            remember(theme);
            apply(theme);
        });
        actions.appendChild(button);
        apply(root.dataset.theme);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    window.addEventListener('storage', event => { if (event.key === key) apply(readTheme()); });
    window.addEventListener('focus', () => apply(readTheme()));
    window.addEventListener('pageshow', () => apply(readTheme()));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(readTheme()); });
})();
