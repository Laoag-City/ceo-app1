import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM, VirtualConsole} from 'jsdom'

const shell = readFileSync(new URL('../features/queue/client-history.html', import.meta.url), 'utf8')
const controller = shell.match(/<script data-client-history>([\s\S]*?)<\/script>/)[1]
const bundle = readFileSync(new URL('../../system-dist/app.js', import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
const record = {id:1001, ticketId:'TKT-1001', name:'Juan Dela Cruz', phone:'09123456789', barangay:'Address: Laoag | Bldg Loc: Vintar', reason:'Releasing Bldg. Permit', status:'completed', created_at:'2026-10-05T02:10:00Z', called_by:'PC1'}
const response = (rows = [record], page = 1, total = rows.length) => ({success:true, rows, pagination:{page, pageSize:20, total, totalPages:Math.max(1, Math.ceil(total / 20))}})

function fixture(fetch) {
 const dom = new JSDOM('<body class="queue-admin-page client-history-page"><div id="system-react-root" data-page="queue-client-history"></div></body>', {url:'http://localhost:5000/client-history.html', runScripts:'outside-only', virtualConsole:new VirtualConsole()})
 const w = dom.window, calls = []
 w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}})
 w.eval(bundle)
 w.RequestFeedback = {fetch:async url => {calls.push(new URL(url, w.location.href)); return {json:async () => fetch ? await fetch(calls.at(-1), calls.length) : response()}}}
 w.eval(controller)
 return {dom, w, doc:w.document, calls, get:id => w.document.getElementById(id), submit(value) {w.document.getElementById('historySearch').value = value; w.document.getElementById('historySearchForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}))}}
}

test('history shows saved contacts, service, status and Philippine registration date', async () => {
 const f = fixture()
 try {
  await tick()
  const text = f.get('historyTableBody').textContent
  for (const field of ['TKT-1001', 'Juan Dela Cruz', '09123456789', 'Laoag', 'Vintar', 'Completed', 'Window 1', '10:10']) assert.ok(text.includes(field), field)
  assert.equal(f.get('historyCount').textContent, '1 visit recorded')
  assert.equal(f.get('historyNext').disabled, true)
  assert.equal(f.get('historyResults').getAttribute('aria-busy'), 'false')
 } finally {f.dom.window.close()}
})

test('one search accepts each requested field and encodes punctuation without changing the query', async () => {
 const f = fixture()
 try {
  await tick()
  for (const query of ['Juan Dela Cruz', 'Address: Laoag', 'TKT-1001', '09123456789', 'A&B + %_']) {
   f.submit('  ' + query + '  '); await tick()
   assert.equal(f.calls.at(-1).searchParams.get('q'), query)
   assert.equal(f.calls.at(-1).searchParams.get('page'), '1')
   assert.equal(f.get('historyClear').hidden, false)
  }
  f.get('historyClear').click(); await tick()
  assert.equal(f.get('historySearch').value, '')
  assert.equal(f.calls.at(-1).searchParams.get('q'), '')
  assert.equal(f.get('historyClear').hidden, true)
 } finally {f.dom.window.close()}
})

test('pagination retains the search and refresh retains the current page', async () => {
 const f = fixture(url => response([record], Number(url.searchParams.get('page')), 41))
 try {
  await tick(); f.submit('Laoag'); await tick()
  f.get('historyNext').click(); await tick()
  assert.equal(f.calls.at(-1).searchParams.get('q'), 'Laoag')
  assert.equal(f.calls.at(-1).searchParams.get('page'), '2')
  assert.equal(f.get('historyPage').textContent, 'Page 2 of 3')
  assert.equal(f.get('historyPrevious').disabled, false)
  f.get('historyRefresh').click(); await tick()
  assert.equal(f.calls.at(-1).searchParams.get('page'), '2')
  f.get('historyPrevious').click(); await tick()
  assert.equal(f.get('historyPrevious').disabled, true)
 } finally {f.dom.window.close()}
})

test('a slow older search cannot overwrite newer results', async () => {
 let resolveOld
 const f = fixture((url, number) => number === 2 ? new Promise(resolve => {resolveOld = resolve}) : response([{...record, name:url.searchParams.get('q') || record.name}]))
 try {
  await tick(); f.submit('Old query'); await tick()
  f.submit('Latest query'); await tick()
  assert.ok(f.get('historyTableBody').textContent.includes('Latest query'))
  resolveOld(response([{...record, name:'Old query'}])); await tick()
  assert.ok(f.get('historyTableBody').textContent.includes('Latest query'))
  assert.equal(f.get('historyResults').getAttribute('aria-busy'), 'false')
 } finally {f.dom.window.close()}
})

test('stored client values render as text even when they contain HTML', async () => {
 const malicious = '<img src=x onerror="alert(1)">'
 const f = fixture(() => response([{...record, name:malicious, phone:malicious, barangay:malicious, reason:malicious}]))
 try {
  await tick()
  assert.equal(f.get('historyTableBody').querySelector('img'), null)
  assert.ok(f.get('historyTableBody').textContent.includes(malicious))
 } finally {f.dom.window.close()}
})

test('empty searches explain the result and failed requests can be retried', async () => {
 let fail = true
 const f = fixture(() => {if (fail) throw new Error('Your queue session ended. Please sign in again.'); return response([])})
 try {
  await tick()
  assert.equal(f.get('historyFeedback').hidden, false)
  assert.match(f.get('historyFeedback').textContent, /sign in again/)
  assert.equal(f.get('historyRefresh').disabled, false)
  fail = false; f.submit('Nobody'); await tick()
  assert.equal(f.get('historyFeedback').hidden, true)
  assert.match(f.get('historyTableBody').textContent, /No clients match/)
  assert.equal(f.get('historyCount').textContent, '0 visits found')
 } finally {f.dom.window.close()}
})

test('workstations exposes history as a link without claiming a service window', () => {
 const dom = new JSDOM('<div id="system-react-root" data-page="queue-log-in"></div>', {url:'http://localhost:5000/workstations.html', runScripts:'outside-only', virtualConsole:new VirtualConsole()})
 try {
  dom.window.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}})
  dom.window.eval(bundle)
  const link = dom.window.document.querySelector('a.client-history-link')
  assert.equal(link.getAttribute('href'), 'client-history.html')
  assert.equal(link.hasAttribute('data-value'), false)
  const loginShell = readFileSync(new URL('../features/queue/login.html', import.meta.url), 'utf8')
  assert.ok(loginShell.includes("querySelectorAll('.station-card[data-value]')"))
  assert.equal(dom.window.document.querySelectorAll('.station-card[data-value]').length, 5)
 } finally {dom.window.close()}
})
