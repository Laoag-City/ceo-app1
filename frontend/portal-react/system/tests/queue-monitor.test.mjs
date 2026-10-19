import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {JSDOM, VirtualConsole} from 'jsdom'

const shell = readFileSync(new URL('../features/queue/monitor.html', import.meta.url), 'utf8')
const controller = [...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes("socket.on('queueUpdate'"))
const bundle = readFileSync(new URL('../../system-dist/app.js', import.meta.url), 'utf8')

function fixture(prepare) {
    const dom = new JSDOM('<body class="queue-monitor-page"><div id="system-react-root" data-page="queue-monitor" style="display:contents"></div></body>', {
        url: 'http://localhost:5000/monitor.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole()
    })
    const w = dom.window, handlers = {}, intervals = []
    w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}})
    w.sessionStorage.setItem('currentWorkspace', 'Monitor')
    w.io = () => ({on: (event, callback) => {handlers[event] = callback}})
    w.HTMLMediaElement.prototype.play = async () => {}
    w.HTMLMediaElement.prototype.pause = () => {}
    w.HTMLMediaElement.prototype.load = () => {}
    w.RequestFeedback = {fetch: async () => ({json:async () => ({success:true, playlist:[]})})}
    w.setInterval = (callback, milliseconds) => {intervals.push({callback, milliseconds}); return intervals.length}
    w.eval(bundle)
    if (prepare) prepare(w)
    w.eval(controller)
    return {dom, w, document:w.document, handlers, intervals}
}

const ticket = (id, reason, extra = {}) => ({id:'TKT-' + id, reason, ...extra})
const callCard = (f, window) => f.document.querySelector('.monitor-calling-window[data-window="' + window + '"]')
const callNumber = (f, window) => callCard(f, window).querySelector('.monitor-call-ticket').textContent

test('reconnecting reloads the video playlist and an empty update clears old media', async () => {
    const f = fixture()
    try {
        await new Promise(resolve => setImmediate(resolve))
        f.w.RequestFeedback.fetch = async () => ({ok:true,json:async()=>({success:true,playlist:['/uploads/original.mp4']})})
        f.handlers.connect()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(f.document.getElementById('lobbyVideo').getAttribute('src'), '/uploads/original.mp4')
        f.handlers.playlistUpdate({playlist:[]})
        assert.equal(f.document.getElementById('lobbyVideo').hasAttribute('src'), false)
    } finally { f.dom.window.close() }
})

test('late playlist loads cannot replace a newer upload or restart the same video', async () => {
    const f = fixture()
    try {
        await new Promise(resolve => setImmediate(resolve))
        let finish
        f.w.RequestFeedback.fetch = () => new Promise(resolve=>{finish=resolve})
        f.handlers.connect()
        f.handlers.playlistUpdate({playlist:['/uploads/new.mp4']})
        finish({ok:true,json:async()=>({success:true,playlist:['/uploads/outdated.mp4']})})
        await new Promise(resolve => setImmediate(resolve))
        const video=f.document.getElementById('lobbyVideo')
        assert.equal(video.getAttribute('src'), '/uploads/new.mp4')
        video.currentTime=15
        f.handlers.playlistUpdate({playlist:['/uploads/new.mp4','/uploads/next.mp4']})
        assert.equal(video.currentTime,15)
        assert.equal(video.getAttribute('src'), '/uploads/new.mp4')
    } finally { f.dom.window.close() }
})

function audioFixture(allowed) {
    const audio = {allowed, plays:[], spoken:[], timers:[], resumes:0}
    const f = fixture(w => {
        w.AudioContext = class {
            constructor() {this.state = 'suspended'; this.currentTime = 0; audio.context = this}
            resume() {
                audio.resumes++
                if (!audio.allowed) return Promise.reject(new w.DOMException('Interaction required', 'NotAllowedError'))
                this.state = 'running'
                return Promise.resolve()
            }
            createOscillator() {return {frequency:{setValueAtTime(){}}, connect(){}, start(){}, stop(){}}}
            createGain() {return {gain:{setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){}}, connect(){}}}
        }
        w.HTMLMediaElement.prototype.play = function() {
            audio.plays.push({src:this.src, muted:this.muted})
            return !audio.allowed && !this.muted ? Promise.reject(new w.DOMException('Interaction required', 'NotAllowedError')) : Promise.resolve()
        }
        w.HTMLMediaElement.prototype.pause = () => {}
        w.speechSynthesis = {getVoices:()=>[], cancel(){}, speak:utterance=>audio.spoken.push(utterance)}
        w.SpeechSynthesisUtterance = class {constructor(text) {this.text = text}}
        w.setTimeout = (callback, milliseconds) => {audio.timers.push({callback, milliseconds}); return audio.timers.length}
    })
    return {...f, audio}
}

test('failed clips are skipped, all-failed playback falls back, and playlist updates recover',async()=>{
 const f=fixture();
 try {
  await new Promise(resolve=>setImmediate(resolve));
  const video=f.document.getElementById('lobbyVideo');
  f.handlers.playlistUpdate({playlist:['/uploads/broken.mp4','/uploads/good.mp4']});
  video.dispatchEvent(new f.w.Event('error'));
  assert.equal(video.getAttribute('src'),'/uploads/good.mp4');
  video.dispatchEvent(new f.w.Event('ended'));
  assert.equal(video.getAttribute('src'),'/uploads/good.mp4','Failed clips stay skipped on later cycles');
  video.dispatchEvent(new f.w.Event('error'));
  assert.equal(video.hasAttribute('src'),false);
  assert.match(f.document.querySelector('.video-empty-state').textContent,/temporarily unavailable/);
  f.handlers.playlistUpdate({playlist:['/uploads/recovered.mp4']});
  assert.equal(video.getAttribute('src'),'/uploads/recovered.mp4');
  f.handlers.playlistUpdate({playlist:[]});
  assert.equal(video.hasAttribute('src'),false);
  assert.match(f.document.querySelector('.video-empty-state').textContent,/when available/);
 }finally{f.w.close()}
});

test('stalled playback advances after a bounded timeout and normal playback cancels it',async()=>{
 const f=fixture(),timers=new Map();let timerId=0;
 try {
  await new Promise(resolve=>setImmediate(resolve));
  f.w.setTimeout=(callback,milliseconds)=>{const id=++timerId;timers.set(id,{callback,milliseconds});return id;};
  f.w.clearTimeout=id=>timers.delete(id);
  const video=f.document.getElementById('lobbyVideo');
  f.handlers.playlistUpdate({playlist:['/uploads/slow.mp4','/uploads/next.mp4']});
  video.dispatchEvent(new f.w.Event('stalled'));
  assert.equal([...timers.values()][0].milliseconds,20000);
  video.dispatchEvent(new f.w.Event('playing'));assert.equal(timers.size,0);
  video.dispatchEvent(new f.w.Event('waiting'));[...timers.values()][0].callback();
  assert.equal(video.getAttribute('src'),'/uploads/next.mp4');
 }finally{f.w.close()}
});

test('monitor starts sound automatically and resumes the video after ticket announcements', async () => {
    const f = audioFixture(true)
    try {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(f.document.getElementById('enableAnnouncements'), null)
        assert.equal(f.audio.context.state, 'running')
        f.handlers.playlistUpdate({playlist:['/uploads/office.mp4']})
        assert.equal(f.audio.plays.at(-1).muted, false)
        const called = ticket(1001,'Releasing Bldg. Permit',{calledBy:'PC1',recallStamp:1})
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[called], nowServing:called})
        f.audio.timers.find(timer => timer.milliseconds === 1600).callback()
        assert.equal(f.audio.spoken.length, 1)
        assert.match(f.audio.spoken[0].text, /ticket 1 0 0 1.*Window 1/)
        const playCount = f.audio.plays.length
        f.audio.spoken[0].onend()
        assert.equal(f.audio.plays.length, playCount + 1)
        assert.equal(f.audio.plays.at(-1).muted, false)
    } finally {f.dom.window.close()}
})

test('blocked autoplay keeps the video visible and unlocks queued announcements on a page click', async () => {
    const f = audioFixture(false)
    try {
        f.handlers.playlistUpdate({playlist:['/uploads/office.mp4']})
        const called = ticket(1002,'Inquire',{calledBy:'PC3',recallStamp:1})
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[called], nowServing:called})
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(f.audio.spoken.length, 0)
        assert.equal(f.audio.timers.length, 0)
        assert.equal(f.audio.plays.at(-1).muted, true)
        assert.equal(callNumber(f, 'PC3'), 'TKT-1002')
        f.audio.allowed = true
        f.document.body.click()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(f.document.getElementById('lobbyVideo').muted, false)
        assert.equal(f.audio.context.state, 'running')
        f.audio.timers.find(timer => timer.milliseconds === 1600).callback()
        assert.equal(f.audio.spoken.length, 1)
        f.audio.spoken[0].onend()
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[called], nowServing:called})
        f.document.body.click()
        assert.equal(f.audio.timers.length, 1, 'Unchanged tickets must not be announced twice')
    } finally {f.dom.window.close()}
})

test('playlist videos keep their own shape without losing the live ticket board', () => {
    const f = fixture()
    try {
        const video = f.document.getElementById('lobbyVideo')
        const called = ticket(1001,'Releasing Bldg. Permit',{calledBy:'PC1',recallStamp:1})
        f.handlers.queueUpdate({queue:[ticket(1002,'Inquire')], onHold:[], serving:[called], nowServing:called})
        for (const [width,height] of [[1080,1920],[1920,1080]]) {
            Object.defineProperty(video, 'videoWidth', {value:width, configurable:true})
            Object.defineProperty(video, 'videoHeight', {value:height, configurable:true})
            video.dispatchEvent(new f.w.Event('loadedmetadata'))
            assert.equal(Number(f.document.body.style.getPropertyValue('--monitor-video-ratio')), width / height)
            assert.equal(video.parentElement.classList.contains('is-portrait'), height > width)
            assert.equal(callNumber(f, 'PC1'), 'TKT-1001')
            assert.match(f.document.getElementById('waitingQueueList').textContent, /TKT-1002/)
        }
        Object.defineProperty(video, 'videoHeight', {value:0, configurable:true})
        video.dispatchEvent(new f.w.Event('loadedmetadata'))
        assert.equal(Number(f.document.body.style.getPropertyValue('--monitor-video-ratio')), 1920 / 1080)
    } finally {f.dom.window.close()}
})

test('monitor back returns to station selection on one click while preserving other session state', () => {
    const start = controller.indexOf('    function handleMonitorBack()')
    const storage = new Map([['currentWorkspace', 'Monitor'], ['otherPreference', 'keep']])
    const location = {href:'monitor.html'}
    let back
    vm.runInNewContext(controller.slice(start), {
        sessionStorage: {removeItem: key => storage.delete(key)},
        window: {location},
        document: {getElementById: () => ({addEventListener: (_, handler) => {back = handler}})}
    })
    back()
    assert.equal(location.href, 'workstations.html')
    assert.equal(storage.has('currentWorkspace'), false)
    assert.equal(storage.get('otherPreference'), 'keep')
})

test('public monitor groups live FIFO tickets by service window without personal details', () => {
    const f = fixture()
    try {
        const waiting = [ticket(1002,'Releasing Bldg. Permit',{name:'Private name',phone:'Private phone'}),ticket(1003,'Inquire'),ticket(1004,'Releasing Bldg. Occupancy'),ticket(1005,'Releasing Bldg. Permit')]
        f.handlers.queueUpdate({queue:waiting, onHold:[], serving:[], nowServing:null})
        const columns = [...f.document.querySelectorAll('.monitor-waiting-window')]
        assert.equal(f.document.getElementById('waitingQueueCount').textContent, '4 waiting')
        assert.deepEqual([...columns[0].querySelectorAll('li strong')].map(node => node.textContent), ['TKT-1003'])
        assert.equal(columns[0].querySelector('.monitor-ticket-status').textContent, 'Next')
        assert.equal(columns[2].querySelectorAll('.monitor-ticket-position')[1].textContent, '2')
        assert.equal(columns[1].querySelector('li strong').textContent, 'TKT-1004')
        assert.deepEqual([...columns[2].querySelectorAll('li strong')].map(node => node.textContent), ['TKT-1002','TKT-1005'])
        assert.doesNotMatch(f.document.body.textContent, /Private name|Private phone/)
    } finally {f.dom.window.close()}
})

test('waiting, serving and held ticket displays follow the latest queue state', () => {
    const f = fixture()
    try {
        const called = ticket(1001,'Releasing Bldg. Permit',{calledBy:'PC1',recallStamp:1})
        const held = ticket(1003,'Inquire')
        f.handlers.queueUpdate({queue:[ticket(1002,'Releasing Bldg. Occupancy')], onHold:[held], serving:[called], nowServing:called})
        assert.equal(callNumber(f, 'PC1'), 'TKT-1001')
        assert.match(callCard(f, 'PC1').getAttribute('aria-label'), /Proceed to Window 1/)
        assert.equal(f.document.getElementById('windowServingList'), null, 'No duplicate bottom window cards')
        assert.equal(f.document.getElementById('monitorHoldList').hidden, false)
        assert.match(f.document.getElementById('monitorHoldList').textContent, /TKT-1003 · Window 1/)
        assert.doesNotMatch(f.document.getElementById('waitingQueueList').textContent, /TKT-1001|TKT-1003/)
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[], nowServing:null})
        assert.equal(callNumber(f, 'PC1'), '---')
        assert.equal(f.document.getElementById('waitingQueueCount').textContent, '0 waiting')
        assert.equal(f.document.getElementById('monitorHoldList').hidden, true)
        assert.equal(f.document.querySelectorAll('.monitor-waiting-empty').length, 3)
        f.handlers.disconnect()
        assert.equal(f.document.querySelector('#monitorConnection b').textContent, 'Reconnecting')
        f.handlers.connect()
        assert.equal(f.document.querySelector('#monitorConnection b').textContent, 'Live queue')
    } finally {f.dom.window.close()}
})

test('Now calling keeps every window visible as tickets are held, finished, replaced and recalled', () => {
    const f = fixture()
    try {
        const first = ticket(1001, 'Releasing Bldg. Permit', {calledBy:'PC1', recallStamp:1, name:'Private name', phone:'Private phone'})
        const second = ticket(1002, 'Releasing Bldg. Occupancy', {calledBy:'PC2', recallStamp:2})
        const third = ticket(1003, 'Inquire', {calledBy:'PC3', recallStamp:3})
        const cards = ['PC1','PC2','PC3'].map(window => callCard(f, window))
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[third, second, first], nowServing:third})
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callNumber(f, window)), ['TKT-1001','TKT-1002','TKT-1003'])
        assert.doesNotMatch(f.document.getElementById('callingWindowList').textContent, /Private name|Private phone/)
        assert.equal(f.document.getElementById('servingCard').classList.contains('is-idle'), false)
        for (const card of cards) card.dispatchEvent(new f.w.Event('animationend'))
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[third, second, first], nowServing:third})
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callCard(f, window)), cards, 'Updates retain the same window cards')
        assert.equal(cards.some(card => card.classList.contains('is-new-call')), false)

        f.handlers.queueUpdate({queue:[], onHold:[first], serving:[third, second], nowServing:third})
        assert.equal(callNumber(f, 'PC1'), '---')
        assert.equal(callCard(f, 'PC1').querySelector('.monitor-call-status').textContent, 'Available')
        assert.deepEqual(['PC2','PC3'].map(window => callNumber(f, window)), ['TKT-1002','TKT-1003'])
        const next = ticket(1004, 'Releasing Bldg. Permit', {calledBy:'PC1', recallStamp:4})
        f.handlers.queueUpdate({queue:[], onHold:[first], serving:[next, third, second], nowServing:next})
        assert.equal(callNumber(f, 'PC1'), 'TKT-1004')
        assert.equal(cards[0].classList.contains('is-new-call'), true)
        assert.equal(cards[1].classList.contains('is-new-call'), false)
        assert.equal(cards[2].classList.contains('is-new-call'), false)
        cards[0].dispatchEvent(new f.w.Event('animationend'))
        f.handlers.queueUpdate({queue:[], onHold:[first], serving:[{...second, recallStamp:5}, next, third], nowServing:second})
        assert.equal(cards[0].classList.contains('is-new-call'), false)
        assert.equal(cards[1].classList.contains('is-new-call'), true)
        assert.equal(cards[2].classList.contains('is-new-call'), false)
        f.handlers.disconnect()
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callNumber(f, window)), ['TKT-1004','TKT-1002','TKT-1003'])
        f.handlers.connect()
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[], nowServing:next})
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callNumber(f, window)), ['---','---','---'], 'An empty snapshot overrides a stale latest call')
        assert.equal(f.document.getElementById('servingCard').classList.contains('is-idle'), true)
    } finally {f.dom.window.close()}
})

test('legacy single-call snapshots display safely in the correct window', () => {
    const f = fixture()
    try {
        const called = ticket(1002, '<img src=x onerror="alert(1)">', {calledBy:'PC2', recallStamp:1})
        f.handlers.queueUpdate({queue:[], onHold:[], nowServing:called})
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callNumber(f, window)), ['---','TKT-1002','---'])
        assert.equal(callCard(f, 'PC2').querySelector('img'), null)
        assert.equal(callCard(f, 'PC2').querySelector('.monitor-call-reason').textContent, 'Purpose: ' + called.reason)
    } finally {f.dom.window.close()}
})

test('simultaneous window calls announce one at a time and unchanged snapshots do not repeat them', async () => {
    const f = audioFixture(true)
    try {
        await new Promise(resolve => setImmediate(resolve))
        const serving = [
            ticket(1003, 'Inquire', {calledBy:'PC3', recallStamp:3}),
            ticket(1002, 'Releasing Bldg. Occupancy', {calledBy:'PC2', recallStamp:2}),
            ticket(1001, 'Releasing Bldg. Permit', {calledBy:'PC1', recallStamp:1})
        ]
        f.handlers.queueUpdate({queue:[], onHold:[], serving, nowServing:serving[0]})
        assert.equal(f.audio.timers.length, 1, 'Only the first chime starts immediately')
        assert.deepEqual(['PC1','PC2','PC3'].map(window => callNumber(f, window)), ['TKT-1001','TKT-1002','TKT-1003'])
        for (let index=0; index<3; index++) {
            f.audio.timers[index].callback()
            assert.equal(f.audio.spoken.length, index + 1)
            assert.match(f.audio.spoken[index].text, new RegExp('Window ' + (index + 1)))
            f.audio.spoken[index].onend()
        }
        f.handlers.queueUpdate({queue:[], onHold:[], serving, nowServing:serving[0]})
        assert.equal(f.audio.timers.length, 3)
        f.handlers.queueUpdate({queue:[], onHold:[], serving:[serving[0], {...serving[1], recallStamp:4}, serving[2]], nowServing:serving[1]})
        assert.equal(f.audio.timers.length, 4)
        f.audio.timers[3].callback()
        assert.match(f.audio.spoken[3].text, /Window 2/)
        f.audio.spoken[3].onend()
    } finally {f.dom.window.close()}
})

test('long waiting and hold lists rotate through every ticket and retain queue positions', () => {
    const f = fixture()
    try {
        const waiting = Array.from({length:17}, (_, i) => ticket(1001+i,'Releasing Bldg. Permit'))
        const held = Array.from({length:9}, (_, i) => ticket(2001+i,'Inquire'))
        f.handlers.queueUpdate({waiting, onHold:held, serving:[], nowServing:null})
        const rotate = f.intervals.find(interval => interval.milliseconds === 8000).callback
        const seen = new Set(), seenHeld = new Set()
        for (let page=0; page<10; page++) {
            for (const node of f.document.querySelectorAll('.monitor-waiting-ticket strong')) seen.add(node.textContent)
            for (const node of f.document.querySelectorAll('#monitorHoldList span')) seenHeld.add(node.textContent.split(' · ')[0])
            const first = f.document.querySelector('.monitor-waiting-ticket')
            const expectedPosition = Number(first.querySelector('strong').textContent.slice(4)) - 1000
            assert.equal(first.querySelector('.monitor-ticket-position').textContent, String(expectedPosition))
            rotate()
        }
        assert.equal(seen.size, 17)
        assert.equal(seenHeld.size, 9)
        assert.match(f.document.getElementById('waitingPaginationNote').textContent, /rotate every 8 seconds/)
    } finally {f.dom.window.close()}
})
