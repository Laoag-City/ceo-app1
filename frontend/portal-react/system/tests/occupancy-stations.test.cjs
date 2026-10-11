const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '..');
const standard = ['Line & Grade', 'Architectural', 'Civil / Structural', 'Electrical', 'Mechanical', 'Sanitary', 'Plumbing', 'Electronics', 'Fire Safety'];
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
async function fixture({saved, matrix = [], supported = true, conflict = false, assigned = 'Electrical'} = {}) {
    const dom = new JSDOM('<div id="system-react-root" data-page="permits-occupancy_edit"></div>', {
        url:'http://localhost/occupancy/edit?id=7', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole()
    });
    const w = dom.window, d = w.document, calls = [], errors = [];
    w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}});
    w.ResizeObserver = class { observe(){} disconnect(){} };
    w.AbortController = AbortController;
    w.alert = message => errors.push(message);
    w.confirm = () => true;
    w.sessionStorage.setItem('oboUser', JSON.stringify({id:1, username:'operator', role:'operator'}));
    if (saved !== undefined) w.localStorage.setItem('occupancyQuickTemplates:v1:1', JSON.stringify(saved));
    const record = {
        id:7, project_title:'Existing permit', location:'Laoag', owner_name:'Owner', bp_reference_no:'BP-7', date_applied:'2026-10-06',
        rejection_history:'[]', matrix, _version:'loaded-project', assigned_station:assigned,
        _signatureDatesSupported:true, _stationAccessSupported:true, _assignedEngineerProfileSupported:true,
        _standardOccupancyStationsSupported:supported, standard_stations:standard
    };
    w.fetch = async (url, options = {}) => {
        calls.push({url, options});
        if (url === '/api/occupancy/7/stations/initialize' && options.method === 'POST') {
            if (conflict) return new Response(JSON.stringify({success:false, message:'This project has changed. Refresh before adding stations.'}), {status:409});
            record.matrix = standard.map((discipline_name, index) => ({
                id:index + 30, discipline_name, signature_status:'Pending', feedback_remarks:'', date_checked:'', date_approved:'',
                can_edit:discipline_name === assigned, assigned_operator_id:discipline_name === assigned ? 1 : null,
                engineer_profile_bound:true, engineer_name:discipline_name === assigned ? 'Engineer Cruz' : ''
            }));
            record._version = 'initialized-project';
            return new Response(JSON.stringify({success:true}));
        }
        const body = url.endsWith('/checklist') ? {success:true, checklist_state:{}, _version:'checklist'}
            : url.endsWith('/inspections') ? {success:true, inspections:[]}
            : url === '/api/presence' ? {success:true} : record;
        return new Response(JSON.stringify(body));
    };
    w.eval(fs.readFileSync(path.resolve(base, '../system-dist/app.js'), 'utf8'));
    await settle();
    for (const name of ['project-identity.js', 'request-feedback.js', 'form-safety.js', 'login-feedback.js', 'workspace-notice.js', 'occupancy-checklist.js', 'station-dates.js', 'project-approval.js', 'occupancy-templates.js']) {
        w.eval(fs.readFileSync(path.join(base, 'assets/permits', name), 'utf8'));
    }
    const html = fs.readFileSync(path.join(base, 'features/occupancy/details.html'), 'utf8');
    const controller = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('const urlParams'));
    w.eval(controller);
    await w.fetchPermitData();
    return {dom, w, d, calls, errors, record};
}

test('Occupancy keeps the assigned station selectable with empty personal templates and restores defaults only on request', async () => {
    const {dom, w, d, calls} = await fixture({saved:[], assigned:'Land Use and Zoning'});
    try {
        const select = d.getElementById('disciplineSelect');
        assert.deepEqual([...select.options].filter(option => option.value).map(option => option.value), ['Land Use and Zoning']);
        assert.equal(w.localStorage.getItem('occupancyQuickTemplates:v1:1'), '[]');
        d.getElementById('manageOccTemplates').click();
        d.getElementById('restoreOccTemplates').click();
        assert.deepEqual([...select.options].filter(option => option.value).map(option => option.value), [...standard, 'Land Use and Zoning']);
        assert.deepEqual(JSON.parse(w.localStorage.getItem('occupancyQuickTemplates:v1:1')), standard);
        assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
    } finally { await settle(); dom.window.close(); }
});

test('restoring Occupancy standards retains custom personal templates without changing active routing', async () => {
    const {dom, w, d, calls} = await fixture({saved:['Custom clearance']});
    try {
        d.getElementById('restoreOccTemplates').click();
        assert.deepEqual(JSON.parse(w.localStorage.getItem('occupancyQuickTemplates:v1:1')), [...standard, 'Custom clearance']);
        assert.match(d.getElementById('disciplineConfigList').textContent, /No stations assigned/);
        assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
    } finally { await settle(); dom.window.close(); }
});

test('Occupancy lists an assigned station once when its spelling matches a standard discipline canonically', async () => {
    for (const assigned of ['Line and Grade', 'Ｌｉｎｅ ＆ Ｇｒａｄｅ']) {
        const {dom, w, d, calls} = await fixture({assigned});
        try {
            const names = [...d.getElementById('disciplineSelect').options].filter(option => option.value).map(option => option.value);
            assert.deepEqual(names, standard);
            assert.equal(w.localStorage.getItem('occupancyQuickTemplates:v1:1'), null);
            assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
        } finally { await settle(); dom.window.close(); }
    }
});

test('restoring Occupancy standards removes canonical aliases while retaining custom templates and the selected station', async () => {
    const custom = ['Line and Grade', 'Ｓａｎｉｔａｒｙ', 'Civil-Structural', 'Custom clearance'];
    const {dom, w, d, calls} = await fixture({saved:custom, assigned:'Line and Grade'});
    try {
        const select = d.getElementById('disciplineSelect');
        select.value = 'Line and Grade';
        assert.deepEqual(JSON.parse(w.localStorage.getItem('occupancyQuickTemplates:v1:1')), custom);
        d.getElementById('restoreOccTemplates').click();
        assert.deepEqual([...select.options].filter(option => option.value).map(option => option.value), [...standard, 'Custom clearance']);
        assert.deepEqual(JSON.parse(w.localStorage.getItem('occupancyQuickTemplates:v1:1')), [...standard, 'Custom clearance']);
        assert.equal(select.value, 'Line & Grade');
        assert.match(d.getElementById('disciplineConfigList').textContent, /No stations assigned/);
        assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
    } finally { await settle(); dom.window.close(); }
});

test('one click initializes an existing empty Occupancy matrix with its loaded version and profile-bound engineers', async () => {
    const {dom, w, d, calls} = await fixture();
    try {
        assert.equal(d.getElementById('standardOccupancyStations').hidden, false);
        assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
        const button = d.getElementById('initializeStandardStations');
        button.click(); button.click();
        await settle();
        const posts = calls.filter(call => call.url === '/api/occupancy/7/stations/initialize');
        assert.equal(posts.length, 1);
        assert.equal(posts[0].options.headers['x-record-version'], 'loaded-project');
        assert.equal(posts[0].options.method, 'POST');
        assert.equal(d.getElementById('tbRouting').textContent, '9');
        assert.equal(d.querySelectorAll('#matrixTableBody tr[data-id]').length, 9);
        assert.equal(d.getElementById('standardOccupancyStations').hidden, true);
        assert.equal(d.querySelector('[data-station-engineer="33"]').textContent, 'Engineer Cruz');
        w.enableEditingMode();
        assert.equal(d.querySelectorAll('#matrixTableBody input[type=text]').length, 0);
        assert.equal(d.querySelectorAll('#matrixTableBody .input-status').length, 1);
        assert.equal(d.querySelector('[data-station-engineer="33"]').textContent, 'Engineer Cruz');
        button.click(); await settle();
        assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 1);
    } finally { await settle(); dom.window.close(); }
});

test('failed Occupancy initialization keeps the empty matrix and enables retry without silently replacing its version', async () => {
    const {dom, d, calls} = await fixture({conflict:true});
    try {
        const button = d.getElementById('initializeStandardStations');
        button.click(); await settle();
        assert.equal(button.disabled, false);
        assert.equal(d.getElementById('standardOccupancyStations').hidden, false);
        assert.match(d.getElementById('standardStationsFeedback').textContent, /project has changed/);
        assert.equal(d.querySelectorAll('#matrixTableBody tr[data-id]').length, 0);
        assert.equal(calls.find(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).options.headers['x-record-version'], 'loaded-project');
    } finally { await settle(); dom.window.close(); }
});

test('Occupancy initialization fails closed with an older server or an already configured workflow', async () => {
    for (const options of [{supported:false}, {matrix:[{id:1, discipline_name:'Sanitary', signature_status:'Pending', can_edit:false, engineer_profile_bound:true}]}]) {
        const {dom, d, calls} = await fixture(options);
        try {
            assert.equal(d.getElementById('standardOccupancyStations').hidden, true);
            d.getElementById('initializeStandardStations').click(); await settle();
            assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.startsWith('/api/occupancy')).length, 0);
        } finally { await settle(); dom.window.close(); }
    }
});
