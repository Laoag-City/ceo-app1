import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM, VirtualConsole} from 'jsdom'

const shell = readFileSync(new URL('../features/queue/management.html', import.meta.url), 'utf8')
const controller = shell.match(/<script data-video-playlist>([\s\S]*?)<\/script>/)[1]
const bundle = readFileSync(new URL('../../system-dist/app.js', import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
const clips = [{id:1, name:'Office announcements.mp4', active:true, uploadedAt:'2026-10-05T02:00:00Z', available:true, url:'/uploads/one.mp4'},
 {id:2, name:'Missing.mp4', active:false, uploadedAt:null, available:false, url:null},
 {id:3, name:'Visitor guide.mp4', active:true, uploadedAt:null, available:true, url:'/uploads/three.mp4'}]
const managed = (videos = clips, role = 'operator') => ({success:true, videos, user:{displayName:'Engineer Gabriel', role}})

function fixture(fetch) {
 const dom = new JSDOM('<body class="queue-admin-page media-page"><div id="system-react-root" data-page="queue-secret-management"></div></body>', {url:'http://localhost:5000/secret-management.html', runScripts:'outside-only', virtualConsole:new VirtualConsole()})
 const w = dom.window, calls = []
 w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}})
 w.HTMLMediaElement.prototype.pause = function() {}
 w.HTMLMediaElement.prototype.load = function() {}
 w.HTMLDialogElement.prototype.showModal = function() {this.setAttribute('open','')}
 w.HTMLDialogElement.prototype.close = function() {this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))}
 w.eval(bundle)
 w.RequestFeedback = {fetch:async(url, options = {}) => {calls.push({url, options});return {ok:true,json:async()=>fetch ? await fetch(url,options,calls.length) : url.endsWith('/manage') ? managed() : {success:true}}}}
 w.eval(controller)
 return {dom, w, calls, get:id=>w.document.getElementById(id), action(id,name) {return w.document.querySelector('[data-id="'+id+'"][data-action="'+name+'"]')}, choose(name = 'Clip.mp4', type = 'video/mp4') {
  const file = new w.File(['fixture'],name,{type})
  Object.defineProperty(w.document.getElementById('fileInput'),'files',{value:[file],configurable:true})
  w.document.getElementById('fileInput').dispatchEvent(new w.Event('change'))
  return file
 }, submit() {w.document.getElementById('videoUploadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}}
}

test('playlist shows ordered clips, identity, missing files, and operator-safe navigation',async()=>{
 const f = fixture()
 try {
  await tick()
  assert.equal(f.get('playlistStaff').textContent,'Engineer Gabriel')
  assert.equal(f.get('playlistAuditLink').hidden,true)
  assert.equal(f.get('playlistCount').textContent,'2 ready to play · 3 videos')
  assert.match(f.get('playlistRows').textContent,/File unavailable/)
  assert.equal(f.action(1,'up').disabled,true)
  assert.equal(f.action(3,'down').disabled,true)
  assert.equal(f.action(2,'preview').disabled,true)
  assert.equal(f.action(2,'toggle').textContent,'Enable')
  assert.equal(f.get('playlistUpload').disabled,true)
 } finally {f.w.close()}
})

test('preview opens the selected clip and clears playback when closed',async()=>{
 const f = fixture()
 try {
  await tick();f.action(3,'preview').click()
  assert.equal(f.get('playlistPreview').hasAttribute('open'),true)
  assert.equal(f.get('playlistPreviewTitle').textContent,'Visitor guide.mp4')
  assert.equal(f.get('playlistPreviewVideo').getAttribute('src'),'/uploads/three.mp4')
  f.get('playlistPreviewVideo').dispatchEvent(new f.w.Event('error'))
  assert.equal(f.get('playlistPreviewError').hidden,false)
  f.get('playlistPreviewClose').click()
  assert.equal(f.get('playlistPreview').hasAttribute('open'),false)
  assert.equal(f.get('playlistPreviewVideo').hasAttribute('src'),false)
 } finally {f.w.close()}
})

test('reorder and enable requests use video identities and update only after a saved response',async()=>{
 const f = fixture()
 try {
  await tick();f.action(3,'up').click();await tick()
  let request = f.calls.find(call=>call.url.endsWith('/3/move'))
  assert.deepEqual(JSON.parse(request.options.body),{direction:'up'})
  assert.equal(request.options.headers['x-queue-request'],'1')
  assert.match(f.get('playlistFeedback').textContent,/order updated/)
  f.action(2,'toggle').click();await tick()
  request = f.calls.find(call=>call.url.endsWith('/2/active'))
  assert.deepEqual(JSON.parse(request.options.body),{active:true})
  assert.equal(f.get('playlistFeedback').dataset.kind,'success')
  assert.equal(f.get('playlistRefresh').disabled,false)
 } finally {f.w.close()}
})

test('upload validates the file and serializes repeated submits while keeping failed selections',async()=>{
 let resolveUpload
 const f = fixture((url)=>url.endsWith('/upload') ? new Promise(resolve=>{resolveUpload=resolve}) : managed())
 try {
  await tick();f.choose('Bad.txt','text/plain')
  assert.equal(f.get('playlistUpload').disabled,true)
  assert.match(f.get('playlistFeedback').textContent,/Choose an MP4/)
  f.choose();f.submit();f.submit();await tick()
  assert.equal(f.calls.filter(call=>call.url.endsWith('/upload')).length,1)
  assert.equal(f.get('playlistUpload').disabled,true)
  assert.equal(f.get('playlistBrowse').disabled,true)
  resolveUpload({success:false,message:'Storage unavailable'});await tick()
  assert.equal(f.get('playlistFeedback').textContent,'Storage unavailable')
  assert.equal(f.get('fileSelectedFeedback').hidden,false)
  assert.equal(f.get('playlistUpload').disabled,false)
 } finally {f.w.close()}
})

test('successful uploads clear the selection and a later refresh failure remains visible',async()=>{
 let saved = false
 const f = fixture(url=>{if(url.endsWith('/upload')){saved=true;return {success:true}}if(saved)throw Error('Refresh unavailable');return managed()})
 try {
  await tick();f.choose();f.submit();await tick()
  assert.equal(f.get('fileSelectedFeedback').hidden,true)
  assert.equal(f.get('playlistUpload').disabled,true)
  assert.equal(f.get('playlistFeedback').dataset.kind,'error')
  assert.equal(f.get('playlistFeedback').textContent,'Refresh unavailable')
  assert.equal(f.get('playlistRows').children.length,3)
 } finally {f.w.close()}
})

test('stored filenames render as text and administrators alone see the audit link',async()=>{
 const name = '<img src=x onerror="alert(1)">'
 const f = fixture(()=>managed([{...clips[0],name}],'admin'))
 try {
  await tick()
  assert.equal(f.get('playlistRows').querySelector('img'),null)
  assert.ok(f.get('playlistRows').textContent.includes(name))
  assert.equal(f.get('playlistAuditLink').hidden,false)
  f.action(1,'preview').click()
  assert.equal(f.get('playlistPreviewTitle').textContent,name)
 } finally {f.w.close()}
})

test('a slow initial response cannot overwrite a newer refreshed playlist',async()=>{
 let first
 const f = fixture((url,options,number)=>number === 1 ? new Promise(resolve=>{first=resolve}) : managed([{...clips[0],name:'Latest.mp4'}]))
 try {
  await tick();f.get('playlistRefresh').click();await tick()
  first(managed());await tick()
  assert.match(f.get('playlistRows').textContent,/Latest.mp4/)
  assert.equal(f.get('playlistRows').children.length,1)
 } finally {f.w.close()}
})

test('empty and failed playlists explain the state and remain refreshable',async()=>{
 let fail = true
 const f = fixture(()=>{if(fail)throw Error('Session unavailable');return managed([])})
 try {
  await tick();assert.match(f.get('playlistRows').textContent,/could not be loaded/)
  assert.equal(f.get('playlistRefresh').disabled,false)
  fail=false;f.get('playlistRefresh').click();await tick()
  assert.match(f.get('playlistRows').textContent,/No videos yet/)
  assert.equal(f.get('playlistFeedback').hidden,true)
 } finally {f.w.close()}
})

test('delete requires confirmation, cancellation makes no request, and double clicks send one deletion',async()=>{
 let finish,deleted=false;
 const f=fixture(url=>url==='/api/videos/2'?new Promise(resolve=>{finish=()=>{deleted=true;resolve({success:true})}}):managed(deleted?clips.filter(clip=>clip.id!==2):clips));
 try{
  await tick();f.action(2,'delete').click();assert.equal(f.get('playlistDelete').open,true);assert.equal(f.get('playlistDeleteName').textContent,'Missing.mp4');
  f.get('playlistDeleteCancel').click();assert.equal(f.calls.some(call=>call.options.method==='DELETE'),false);
  f.action(2,'delete').click();f.get('playlistDeleteConfirm').click();f.get('playlistDeleteConfirm').click();await tick();
  const requests=f.calls.filter(call=>call.options.method==='DELETE');assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/videos/2');assert.equal(requests[0].options.headers['x-queue-request'],'1');
  assert.equal(f.action(1,'delete').disabled,true);finish();await tick();assert.equal(f.action(2,'delete'),null);assert.match(f.get('playlistFeedback').textContent,/Video deleted/);assert.equal(f.action(1,'delete').disabled,false);
 }finally{f.w.close()}
})

test('failed deletion retains the row and a saved cleanup failure clearly reports its warning',async()=>{
 let fail=true;
 const name='UAT <b>O\'Brien</b>.mp4';const f=fixture(url=>url==='/api/videos/1'?fail?{success:false,message:'Deletion unavailable'}:{success:true,cleanupPending:true}:managed([{...clips[0],name}]));
 try{
  await tick();f.action(1,'delete').click();assert.equal(f.get('playlistDeleteName').textContent,name);assert.equal(f.get('playlistDeleteName').querySelector('b'),null);
  f.get('playlistDeleteConfirm').click();await tick();assert.equal(f.get('playlistFeedback').textContent,'Deletion unavailable');assert.ok(f.action(1,'delete'));
  fail=false;f.action(1,'delete').click();f.get('playlistDeleteConfirm').click();await tick();assert.equal(f.get('playlistFeedback').dataset.kind,'warning');assert.match(f.get('playlistFeedback').textContent,/stored file could not be removed/);
 }finally{f.w.close()}
})
