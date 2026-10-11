const { test } = require('node:test');
const assert = require('node:assert/strict');
const { format } = require('../assets/permits/project-identity.js');
const { select } = require('../assets/permits/registry-filters.js');

test('separate prefixes preserve existing IDs, gaps, and numbers above four digits', () => {
    assert.equal(format('building', 1), 'BP-1');
    assert.equal(format('occupancy', 1), 'OP-1');
    assert.equal(format('occupancy', 6), 'OP-6');
    assert.equal(format('building', 10000), 'BP-10000');
    for (const id of [undefined, null, 0, -1, 'x', '<script>']) assert.equal(format('building', id), '');
});

test('project ID search works with other filters and does not change stored IDs', () => {
    const records = [{ id: 6, project_title: 'House', date_applied: '2026-09-17' }, { id: 16, project_title: 'House' }];
    const state = { query: 'op-6 house', status: 'all', sort: 'newest', from: '', to: '' };
    assert.deepEqual(select(records, state, 'occupancy', () => 'all').map(p => p.id), [6]);
    assert.deepEqual(select(records, { ...state, query: 'BP-6' }, 'occupancy', () => 'all'), []);
    assert.deepEqual(records.map(p => p.id), [6, 16]);
});
