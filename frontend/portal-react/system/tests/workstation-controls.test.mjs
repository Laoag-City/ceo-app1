import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM, VirtualConsole} from 'jsdom'

const shell = readFileSync(new URL('../features/queue/login.html', import.meta.url), 'utf8')
const controller = [...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
 .map(match => match[1]).find(script => script.includes('const cards'))
const bundle = readFileSync(new URL('../../system-dist/app.js', import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))

function fixture(handler = async () => ({allowed:false, message:'This window is already assigned to another signed-in session.'})) {
 const dom = new JSDOM('<body class="queue-login-page"><div id="system-react-root" data-page="queue-log-in"></div></body>', {
  url:'http://localhost:5000/workstations.html', runScripts:'outside-only', virtualConsole:new VirtualConsole()
 })
 const w = dom.window, calls = []
 w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}})
 w.eval(bundle)
 w.RequestFeedback = {fetch:async (url, options = {}) => {
  const call = {url:new URL(url, w.location.href), options, body:options.body ? JSON.parse(options.body) : null}
  calls.push(call)
  const data = await handler(call)
  return {json:async () => data}
 }}
 w.eval(controller)
 return {dom, w, d:w.document, calls, cards:[...w.document.querySelectorAll('.station-card[data-value]')]}
}

test('workstation descriptions show receiving and inquiries at Window 1 and releasing at Windows 2 and 3',()=>{
 const f=fixture()
 try {
  const card=workspace=>f.d.querySelector(`.station-card[data-value="${workspace}"]`).textContent
  assert.match(card('PC1'),/Building and occupancy permit receiving \/ inquiries/)
  assert.match(card('PC2'),/Occupancy permit releasing/)
  assert.match(card('PC3'),/Building permit releasing/)
 } finally {f.dom.window.close()}
})

// JSDOM does not perform native button keyboard activation. Emulate that default
// only when the real controller has not prevented it, as a browser would do.
function activateKey(w, button, key) {
 button.focus()
 const keydown = new w.KeyboardEvent('keydown', {key, bubbles:true, cancelable:true})
 const defaultAllowed = button.dispatchEvent(keydown)
 if (defaultAllowed && key === 'Enter') button.click()
 const keyup = new w.KeyboardEvent('keyup', {key, bubbles:true, cancelable:true})
 const releaseAllowed = button.dispatchEvent(keyup)
 if (defaultAllowed && releaseAllowed && key === ' ') button.click()
}

test('workstation cards use native controls and claim the selected window once by click, Enter, or Space', async () => {
 for (const workspace of ['PC1', 'PC2', 'PC3']) {
  for (const activation of ['click', 'Enter', ' ']) {
   const f = fixture()
   try {
    const card = f.d.querySelector(`.station-card[data-value="${workspace}"]`)
    assert.equal(card.tagName, 'BUTTON')
    assert.equal(card.type, 'button')
    assert.equal(card.querySelector('button,a,input'), null, 'Cards must not contain nested interactive controls')
    if (activation === 'click') card.click()
    else activateKey(f.w, card, activation)
    await tick()
    assert.equal(f.calls.length, 1, `${workspace}: ${activation} must submit once`)
    assert.equal(f.calls[0].url.pathname, '/api/workstations/login')
    assert.equal(f.calls[0].options.method, 'POST')
    assert.deepEqual(f.calls[0].body, {workspace})
    assert.equal(f.d.getElementById('workspaceSelect').value, workspace)
   } finally {f.dom.window.close()}
  }
 }
})

test('a pending window claim blocks repeated activation and preserves the selected window', async () => {
 let rejectClaim
 const f = fixture(() => new Promise((resolve, reject) => {rejectClaim = reject}))
 try {
  const first = f.d.querySelector('.station-card[data-value="PC1"]')
  const second = f.d.querySelector('.station-card[data-value="PC2"]')
  first.click()
  assert.equal(f.calls.length, 1)
  assert.equal(f.d.getElementById('sessionStatus').textContent, 'Opening workstation…')
  for (const card of f.cards) assert.equal(card.getAttribute('aria-disabled'), 'true')
  first.click()
  second.click()
  activateKey(f.w, second, 'Enter')
  activateKey(f.w, second, ' ')
  assert.equal(f.calls.length, 1)
  assert.equal(f.d.getElementById('workspaceSelect').value, 'PC1')
  assert.equal(first.classList.contains('selected'), true)
  assert.equal(second.classList.contains('selected'), false)
  rejectClaim(new Error('Could not reach the queue server.'))
  await tick()
  for (const card of f.cards) {
   assert.equal(card.disabled, false)
   assert.equal(card.hasAttribute('aria-disabled'), false)
  }
  assert.match(f.d.getElementById('sessionStatus').textContent, /Could not reach/)
 } finally {f.dom.window.close()}
})

test('a denied claim reports the server message, restores controls, and allows another window', async () => {
 const f = fixture(async () => ({allowed:false, message:'This window is already assigned to another signed-in session.'}))
 try {
  f.d.querySelector('.station-card[data-value="PC1"]').click()
  await tick()
  const status = f.d.getElementById('sessionStatus')
  assert.equal(status.getAttribute('role'), 'status')
  assert.equal(status.getAttribute('aria-live'), 'polite')
  assert.match(status.textContent, /already assigned/)
  assert.equal(f.w.sessionStorage.getItem('currentWorkspace'), null)
  for (const card of f.cards) {
   assert.equal(card.disabled, false)
   assert.equal(card.hasAttribute('aria-disabled'), false)
  }
  f.d.querySelector('.station-card[data-value="PC3"]').click()
  await tick()
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls[1].body, {workspace:'PC3'})
 } finally {f.dom.window.close()}
})

test('Registration and Monitor open without claiming a service window', async () => {
 for (const workspace of ['Kiosk', 'Monitor']) {
  const f = fixture()
  try {
   f.d.querySelector(`.station-card[data-value="${workspace}"]`).click()
   await tick()
   assert.equal(f.calls.length, 0)
   assert.equal(f.w.sessionStorage.getItem('currentWorkspace'), workspace)
  } finally {f.dom.window.close()}
 }
})

test('Client History remains a navigation link and never submits a window claim', async () => {
 const f = fixture()
 try {
  assert.equal(f.cards.length, 5)
  const history = f.d.querySelector('a.station-card.client-history-link')
  assert.ok(history)
  assert.equal(history.getAttribute('href'), 'client-history.html')
  assert.equal(history.hasAttribute('data-value'), false)
  assert.equal(history.getAttribute('role'), null)
  history.click()
  await tick()
  assert.equal(f.calls.length, 0)
  assert.equal(f.d.getElementById('workspaceSelect').value, '')
  assert.equal(f.w.sessionStorage.getItem('currentWorkspace'), null)
 } finally {f.dom.window.close()}
})
