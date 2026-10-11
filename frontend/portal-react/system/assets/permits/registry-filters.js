/**
 * MAINTAINER GUIDE
 * Pure registry selection plus per-account view preferences.
 * Search, status, dates, sorting, and pagination preferences operate on loaded records. Filtering changes the view only and must not mutate permit data.
 */
/* Shared registry search and view preferences; permit mutations remain in each page. */
(function (root) {
    const identity = typeof module !== 'undefined' && module.exports ? require('./project-identity.js') : root.ProjectIdentity;
    const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    function list(value) {
        if (Array.isArray(value)) return value;
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    function dateKey(value) {
        const key = String(value || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
        const date = new Date(key + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : '';
    }
    const sorts = ['newest', 'oldest', 'id-newest', 'id-oldest', 'az', 'za'];
    function cleanState(value, statuses) {
        const state = value && typeof value === 'object' ? value : {};
        return {
            query: typeof state.query === 'string' ? state.query : '',
            status: statuses.includes(state.status) ? state.status : 'all',
            from: dateKey(state.from), to: dateKey(state.to),
            sort: sorts.includes(state.sort) ? state.sort : 'id-newest',
            page: Number.isSafeInteger(state.page) && state.page > 0 ? state.page : 1
        };
    }
    // Pure view calculation: use date-only keys and sort the filtered array,
    // leaving the caller's record list and permanent project identifiers unchanged.
    function select(records, state, kind, statusOf) {
        if (state.from && state.to && state.from > state.to) return [];
        const words = normalize(state.query).split(' ').filter(Boolean);
        const dateOf = p => dateKey(kind === 'building' ? p.permit_date : p.date_applied);
        return records.filter(Boolean).filter(p => {
            const fields = [identity.format(kind, p.id), p.project_title, p.owner_name, p.location];
            if (kind === 'building') fields.push(p.designer_name, p.sub_project_title, ...list(p.lot_numbers), ...list(p.sub_permits).map(s => s?.title));
            else fields.push(p.bp_reference_no);
            const haystack = normalize(fields.join(' '));
            if (!words.every(word => haystack.includes(word))) return false;
            if (state.status !== 'all' && statusOf(p) !== state.status) return false;
            const date = dateOf(p);
            return (!state.from || (date && date >= state.from)) && (!state.to || (date && date <= state.to));
        }).sort((a, b) => {
            let order = 0;
            if (state.sort === 'id-newest' || state.sort === 'id-oldest') {
                // Compare numeric database IDs, not padded BP/OP display strings.
                order = (Number(a.id) - Number(b.id)) * (state.sort === 'id-oldest' ? 1 : -1);
            } else if (state.sort === 'az' || state.sort === 'za') {
                order = normalize(a.project_title).localeCompare(normalize(b.project_title), 'en', { numeric: true });
                if (state.sort === 'za') order *= -1;
            } else {
                const ad = dateOf(a), bd = dateOf(b);
                if (!ad && bd) return 1;
                if (ad && !bd) return -1;
                order = ad.localeCompare(bd) * (state.sort === 'oldest' ? 1 : -1);
            }
            return order || Number(b.id) - Number(a.id);
        });
    }
    function create(options) {
        let userId = 'guest';
        try { userId = JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.id ?? 'guest'; } catch {}
        const key = `permitRegistryView:v2:${options.kind}:${userId}`;
        let saved;
        try {
            saved = JSON.parse(sessionStorage.getItem(key));
            // Adopt the new default once, retaining existing searches and filters.
            if (!saved) {
                const previous = JSON.parse(sessionStorage.getItem(`permitRegistryView:v1:${options.kind}:${userId}`));
                if (previous) saved = { ...previous, sort: 'id-newest', page: 1 };
            }
        } catch {}
        const restored = cleanState(saved, options.statuses);
        const search = document.getElementById(options.searchId);
        const from = document.getElementById('registryDateFrom');
        const to = document.getElementById('registryDateTo');
        const sort = document.getElementById('registrySort');
        const error = document.getElementById('registryFilterError');
        search.value = restored.query; from.value = restored.from; to.value = restored.to; sort.value = restored.sort;
        options.restore(restored);
        function state() {
            return { query: search.value, from: from.value, to: to.value, sort: sort.value, status: options.status(), page: options.page() };
        }
        function sync() {
            const current = state();
            const invalid = !!(current.from && current.to && current.from > current.to);
            error.hidden = !invalid;
            from.setAttribute('aria-invalid', String(invalid)); to.setAttribute('aria-invalid', String(invalid));
            document.querySelectorAll('[data-registry-status]').forEach(button => {
                const active = button.dataset.registryStatus === current.status;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            document.getElementById('registryClear').disabled = !current.query && !current.from && !current.to && current.status === 'all' && current.sort === 'id-newest';
            try { sessionStorage.setItem(key, JSON.stringify(current)); } catch {}
        }
        search.addEventListener('input', options.change);
        [from, to, sort].forEach(control => control.addEventListener('change', options.change));
        document.getElementById('registryClear').addEventListener('click', () => {
            search.value = ''; from.value = ''; to.value = ''; sort.value = 'id-newest';
            options.restore(cleanState({}, options.statuses));
            options.change();
            search.focus();
        });
        sync();
        return { state, sync };
    }
    const api = { normalize, list, dateKey, cleanState, select, create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RegistryFilters = api;
})(typeof window === 'undefined' ? globalThis : window);
