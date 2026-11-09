/**
 * MAINTAINER GUIDE
 * Shared permit navigation: staff registries, admin dashboard, superadmin dashboard.
 * Old login URLs converge on /login. History restoration rechecks the stored login state.
 * Server-protected pages seed the verified user before these UI guards run. Cookies authenticate API requests.
 */
/* Navigation is presentation; permitSessions enforces identity and permissions. */
(function(root) {
    const destinations = {operator:'/index.html', admin:'/admin', superadmin:'/superadmin'};
    function home(user) { return user && Number(user.id) > 0 ? destinations[user.role] || '/login' : '/login'; }
    function readUser() { try { return JSON.parse(root.sessionStorage.getItem('oboUser') || 'null'); } catch { return null; } }
    function redirectFor(page, path, user) {
        const target = home(user);
        if(page === 'legacy-login') return '/login';
        if(page === 'login') return null;
        if(target === '/login') return '/login';
        if(page === 'dashboard') return path === target ? null : target;
        if(page === 'operator' && !['operator','admin'].includes(user.role)) return target;
        if(['reports','inbox'].includes(page) && user.role !== 'admin') return target;
        return null;
    }
    const api = {home, readUser, redirectFor};
    if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    const transport = root.fetch.bind(root);
    // The custom header plus server origin checks prevents cross-site writes.
    // Identity headers are only stale-tab hints, never authentication.
    root.fetch = function(input, options = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if(url.origin !== location.origin || !url.pathname.startsWith('/api/')) return transport(input,options);
        const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('x-permit-request','1');
        return transport(input,{...options,headers,credentials:'same-origin'});
    };
    api.logout = async function() {
        try {
            const response=await root.fetch('/api/auth/logout',{method:'POST'});
            if(!response.ok) throw new Error('Could not sign out. Please try again.');
            root.sessionStorage.removeItem('oboUser');
            location.replace('/login');
        } catch(error) { alert(error.message || 'Could not reach the server. Please try signing out again.'); }
    };
    root.PermitRouting = api;
    const page = document.currentScript?.dataset.page;
    if(!page) return;
    const redirect = redirectFor(page, location.pathname, readUser());
    if(redirect) {
        document.documentElement.style.visibility = 'hidden';
        location.replace(redirect);
    }
    // History restoration must revalidate cookies, not trust an old tab's cache.
    addEventListener('pageshow', async event => {
        if(!event.persisted || page==='login' || page==='legacy-login') return;
        document.documentElement.style.visibility='hidden';
        try {
            const response=await root.fetch('/api/auth/session',{cache:'no-store'});
            if(response.status===401) {
                const data=await response.json();document.documentElement.style.visibility='';
                if(data.code==='SESSION_REPLACED' && root.SessionNotice){root.SessionNotice.handle(data);return;}
                root.sessionStorage.removeItem('oboUser');location.replace('/login');return;
            }
            if(!response.ok) throw new Error('Session could not be verified.');
            const data=await response.json();root.sessionStorage.setItem('oboUser',JSON.stringify(data.user));
            location.reload();
        } catch(error) {document.documentElement.style.visibility='';alert('Could not verify your session. Refresh when the server is available.');}
    });
})(typeof window === 'undefined' ? globalThis : window);
