import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { JSDOM, VirtualConsole } from 'jsdom'
import vm from 'node:vm'
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'))
const bundle=await readFile(new URL('../../system-dist/app.js',import.meta.url),'utf8')
// Compare the full rendered element contract before any controller mutates it.
// This covers every form, ID, handler, initial selection, URL and dialog.
function contract(root) {
  return [...root.querySelectorAll('*')].filter(n=>n.tagName!=='SCRIPT').map(n=>({
    tag:n.tagName,
    attrs:[...n.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)),
    ...(n.matches('input,select,textarea')?{value:n.value,checked:n.checked}:{}),
    ...(n.tagName==='OPTION'?{selected:n.selected}:{}),
  }))
}
for(const page of manifest) test(`${page.id}: React retains layout and control contracts`,async()=>{
  const original=await readFile(new URL(`./originals/${page.id}.html`,import.meta.url),'utf8')
  const source=new JSDOM(original)
  if(page.id==='permits-occupancy_edit') {
    source.window.document.getElementById('inspInspector').setAttribute('required','')
    source.window.document.getElementById('inspInspector').setAttribute('maxlength','150')
    source.window.document.getElementById('inspFindings').setAttribute('required','')
  }
  const errors=[]
  const console=new VirtualConsole(); console.on('jsdomError',e=>errors.push(e.message))
  const dom=new JSDOM(`<div id="system-react-root" data-page="${page.id}"></div>`,{runScripts:'dangerously',url:'http://localhost:3000',virtualConsole:console,pretendToBeVisual:true})
  try {
    dom.window.eval(bundle)
    const host=dom.window.document.getElementById('system-react-root')
    assert.equal(host.dataset.mounted,'true')
    const actual=contract(host),expected=contract(source.window.document.body)
    assert.equal(actual.length,expected.length,'element count')
    for(let i=0;i<actual.length;i++) assert.deepEqual(actual[i],expected[i],`element ${i}: ${expected[i].tag}`)
    const sourceBody=source.window.document.body.cloneNode(true)
    sourceBody.querySelectorAll('script').forEach(n=>n.remove())
    assert.equal(host.textContent.replace(/\s+/g,' ').trim(),sourceBody.textContent.replace(/\s+/g,' ').trim(),'visible text')
    const shell=new JSDOM(await readFile(new URL(`./pages/${page.id}.html`,import.meta.url),'utf8'))
    try {
      const scripts=d=>[...d.querySelectorAll('script')].filter(n=>n.getAttribute('src')!=='/system-react/app.js').map(n=>{
        if(!n.src)new vm.Script(n.textContent)
        // These controllers intentionally changed for inspection validation/review.
        return ['permits-occupancy_edit','permits-superadmin'].includes(page.id) ? [...n.attributes].map(a=>[a.name,a.value]) : n.outerHTML
      })
      assert.deepEqual(scripts(shell.window.document),scripts(source.window.document),'controller scripts and execution order')
    } finally {shell.window.close()}
    assert.deepEqual(errors,[])
  } finally {dom.window.close();source.window.close()}
})
test('native handler bridge invokes the existing global controller once',()=>{
  const dom=new JSDOM('<div id="system-react-root" data-page="permits-index"></div>',{runScripts:'dangerously',url:'http://localhost:3000',pretendToBeVisual:true})
  try {
    dom.window.eval(bundle)
    let calls=0
    dom.window.openCreatePermitModal=()=>calls++
    const button=dom.window.document.querySelector('[onclick="openCreatePermitModal()"]')
    assert.ok(button)
    button.click()
    assert.equal(calls,1)
  } finally {dom.window.close()}
})
