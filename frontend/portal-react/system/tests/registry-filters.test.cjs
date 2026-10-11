const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const filters = require('../assets/permits/registry-filters.js');
const defaults = { query: '', from: '', to: '', sort: 'newest', status: 'all' };
const records = [
    { id: 1, project_title: 'Café 10', owner_name: 'Maria Cruz', location: 'Laoag', designer_name: 'Reyes', permit_date: '2026-09-01', lot_numbers: '["Lot 12"]', sub_permits: '[{"title":"Annex"}]', status: 'pending' },
    { id: 2, project_title: 'Alpha 2', owner_name: 'Gamo', location: 'Dingras', permit_date: '2026-09-09T00:00:00.000Z', status: 'approved' },
    { id: 3, project_title: 'Alpha 10', owner_name: 'Maria', location: 'Laoag', permit_date: '2026-09-09', status: 'rejected' },
    { id: 4, project_title: 'Undated', location: null, permit_date: null, lot_numbers: 'invalid JSON', status: 'pending' }
];
const select = (state = {}, rows = records, kind = 'building') => filters.select(rows, { ...defaults, ...state }, kind, p => p.status).map(p => p.id);
test('search combines words across fields and ignores case, accents and extra whitespace', () => {
    assert.deepEqual(select({ query: '  CAFE   cruz laoag  ' }), [1]);
    for (const query of ['reyes', 'annex', 'lot 12']) assert.deepEqual(select({ query }), [1]);
    assert.deepEqual(select({ query: 'not a matching permit' }), []);
});
test('occupancy searches numeric BP references and location', () => {
    assert.deepEqual(select({ query: '2402000113 dingras' }, [{ id: 8, bp_reference_no: 2402000113, location: 'Dingras' }], 'occupancy'), [8]);
});
test('status, search and inclusive date ranges combine; undated rows are excluded only by dates', () => {
    assert.deepEqual(select({ query: 'laoag', status: 'rejected', from: '2026-09-09', to: '2026-09-09' }), [3]);
    assert.deepEqual(select({ from: '2026-09-01', to: '2026-09-09' }), [3, 2, 1]);
    assert.deepEqual(select({ to: '2026-09-01' }), [1]);
    assert.deepEqual(select({ from: '2026-09-10', to: '2026-09-01' }), []);
    assert.deepEqual(select({ status: 'pending' }), [1, 4]);
});
test('all sort orders are stable, use filing/application date, and leave missing dates last', () => {
    assert.deepEqual(select(), [3, 2, 1, 4]);
    assert.deepEqual(select({ sort: 'oldest' }), [1, 3, 2, 4]);
    assert.deepEqual(select({ sort: 'az' }), [2, 3, 1, 4]);
    assert.deepEqual(select({ sort: 'za' }), [4, 1, 3, 2]);
    assert.deepEqual(select({}, [{ id: 10, date_applied: '2026-01-01' }, { id: 2, date_applied: '2026-09-01' }], 'occupancy'), [2, 10]);
    assert.deepEqual(records.map(p => p.id), [1, 2, 3, 4]);
});
test('malformed stored state and invalid calendar dates fall back safely', () => {
    assert.equal(filters.dateKey('2026-02-30'), '');
    assert.equal(filters.dateKey('2024-02-29'), '2024-02-29');
    assert.deepEqual(filters.cleanState({ page: -1, status: 'unknown', sort: 'bad', from: 'bad' }, ['all']), { ...defaults, sort: 'id-newest', page: 1 });
    assert.deepEqual(select({}, [null, { id: 9, sub_permits: '{"title":"bad"}' }]), [9]);
});
test('project ID sorting is numeric, independent of dates, and restores its preference', () => {
    const rows=[{id:49,permit_date:'2026-12-09'}, {id:51,permit_date:'2026-09-27'}, {id:50,permit_date:'2026-09-23'}, {id:10000}, {id:9999}];
    for(const kind of ['building','occupancy']) {
        assert.deepEqual(select({sort:'id-newest'},rows,kind),[10000,9999,51,50,49]);
        assert.deepEqual(select({sort:'id-oldest'},rows,kind),[49,50,51,9999,10000]);
        const storage=new Map(),view=mount(storage,kind);
        view.elements.get('registrySort').value='id-oldest';
        view.elements.get('registrySort').events.change();
        assert.equal(mount(storage,kind).controller.state().sort,'id-oldest');
    }
    assert.deepEqual(select({sort:'id-newest',from:'2026-09-01',to:'2026-09-30'},rows),[51,50]);
    assert.deepEqual(rows.map(p=>p.id),[49,51,50,10000,9999]);
});

function mount(storage, kind = 'building', id = 7) {
    const elements = new Map();
    function element() {
        return { value: '', attrs: {}, dataset: {}, events: {}, classList: { toggle() {} },
            setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, focus() { this.focused = true; } };
    }
    const document = { getElementById(key) { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); }, querySelectorAll() { return []; } };
    let status, page, changes = 0, controller;
    const sessionStorage = { getItem(k) { return k === 'oboUser' ? JSON.stringify({ id }) : storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, v); } };
    const context = { window: {}, document, sessionStorage };
    vm.runInNewContext(fs.readFileSync(__dirname + '/../assets/permits/registry-filters.js', 'utf8'), context);
    controller = context.window.RegistryFilters.create({ kind, searchId: 'search', statuses: ['all', 'pending'],
        status: () => status, page: () => page, restore: s => { status = s.status; page = s.page; },
        change: () => { changes++; page = 1; controller.sync(); } });
    return { elements, controller, changePage(n) { page = n; controller.sync(); }, get changes() { return changes; } };
}
test('returning to a registry restores filters and page, isolated by system and account', () => {
    const storage = new Map(), first = mount(storage);
    first.elements.get('search').value = 'Cruz';
    first.elements.get('registryDateFrom').value = '2026-09-01';
    first.elements.get('registrySort').value = 'az';
    first.changePage(3);
    const returned = mount(storage);
    assert.equal(returned.controller.state().query, 'Cruz');
    assert.equal(returned.controller.state().from, '2026-09-01');
    assert.equal(returned.controller.state().sort, 'az');
    assert.equal(returned.controller.state().page, 3);
    assert.equal(mount(storage, 'occupancy').controller.state().query, '');
    assert.equal(mount(storage, 'building', 8).controller.state().query, '');
});
test('search edits reset pagination and Clear filters resets all controls', () => {
    const view = mount(new Map());
    view.changePage(4);
    const search = view.elements.get('search'); search.value = 'Cruz'; search.events.input();
    assert.equal(view.controller.state().page, 1);
    view.elements.get('registryDateFrom').value = '2026-09-10';
    view.elements.get('registryDateTo').value = '2026-09-01';
    view.elements.get('registryDateTo').events.change();
    assert.equal(view.elements.get('registryFilterError').hidden, false);
    view.elements.get('registryClear').events.click();
    assert.equal(view.controller.state().query, '');
    assert.equal(view.controller.state().from, '');
    assert.equal(view.elements.get('registryFilterError').hidden, true);
    assert.equal(search.focused, true);
});
test('blocked session storage does not prevent searching', () => {
    const storage = { get() { throw Error('blocked'); }, set() { throw Error('blocked'); } };
    const view = mount(storage);
    view.elements.get('search').value = 'Laoag';
    view.elements.get('search').events.input();
    assert.equal(view.controller.state().query, 'Laoag');
});
test('both registries default and clear to newest ID, migrating old preferences once', () => {
    for (const kind of ['building', 'occupancy']) {
        assert.equal(mount(new Map(), kind).controller.state().sort, 'id-newest');
        const storage=new Map([[`permitRegistryView:v1:${kind}:7`, JSON.stringify({query:'House',sort:'newest',page:3})]]);
        const view=mount(storage,kind);
        assert.equal(view.controller.state().sort,'id-newest');
        assert.equal(view.controller.state().query,'House');
        view.elements.get('registrySort').value='oldest';view.elements.get('registrySort').events.change();
        assert.equal(mount(storage,kind).controller.state().sort,'oldest');
        view.elements.get('registryClear').events.click();
        assert.equal(view.controller.state().sort,'id-newest');
        assert.equal(view.elements.get('registryClear').disabled,true);
    }
});
