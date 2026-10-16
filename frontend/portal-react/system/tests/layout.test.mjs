import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {JSDOM} from 'jsdom'
import vm from 'node:vm'

// Captured from the working bundle BEFORE the September 2026 file organization.
// VERIFY_ORGANIZATION=1 additionally checks exact pre-move content hashes.
// Normal checks protect controller IDs while allowing intentional text/CSS edits.
const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url)))
const expected=JSON.parse(await readFile(new URL('./fixtures/layout-contract.json',import.meta.url)))
const controlIds=JSON.parse(await readFile(new URL('./fixtures/control-ids.json',import.meta.url)))
const bundle=await readFile(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const hash=value=>createHash('sha256').update(value).digest('hex')
const layouts=manifest.flatMap(page=>page.id==='queue-log-in'?[{...page,url:'/workstations.html'},{...page,url:'/log-in.html',login:true}]:[page]);
for(const page of layouts) test(`${page.id}: rendered page and inline controllers survive organization`,async()=>{
  const dom=new JSDOM(`<div id="system-react-root" data-page="${page.id}"></div>`,{url:'http://localhost'+(page.url||'/'),runScripts:'dangerously'})
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  dom.window.ResizeObserver=class {observe(){}disconnect(){}}
  dom.window.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role:page.id==='permits-superadmin'?'admin':'operator'}))
  // Data-loading islands must leave controller targets usable even offline.
  dom.window.fetch=async()=>({ok:false,json:async()=>({message:'Offline test fixture'})})
  try {
    dom.window.eval(bundle)
    await new Promise(resolve=>setTimeout(resolve,40))
    const host=dom.window.document.getElementById('system-react-root')
    assert.equal(host.dataset.mounted,'true')
    if(process.env.VERIFY_ORGANIZATION==='1') assert.equal(hash(host.innerHTML),expected[page.id],'Rendered layout changed')
    const ids=[...host.querySelectorAll('[id]')].map(node=>node.id)
    assert.equal(new Set(ids).size,ids.length,'Duplicate IDs')
    for(const id of (page.login?['queueSignInForm','queueUsername','queuePassword','queueSignInButton','sessionStatus']:controlIds[page.id])) assert.ok(ids.includes(id),`Missing controller target: ${id}`)
    const shell=await readFile(new URL('../'+page.source+'.html',import.meta.url),'utf8')
    // Parse the complete document too: a malformed title can swallow the body
    // before React runs, even when the component itself renders correctly.
    const documentDom=new JSDOM(shell)
    try {
      assert.ok(documentDom.window.document.body.querySelector('#system-react-root'), 'HTML shell must expose the React mount inside its body')
      assert.ok(documentDom.window.document.body.querySelector('script[src="/system-react/app.js"]'), 'HTML shell must expose the layout bundle')
      assert.ok(!documentDom.window.document.title.includes('<'), 'Page title must not consume HTML markup')
    } finally {documentDom.window.close()}
    for(const match of shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(match[1].trim()) new vm.Script(match[1])
    if(page.id==='permits-index') {
      let calls=0;dom.window.openCreatePermitModal=()=>calls++
      host.querySelector('[onclick="openCreatePermitModal()"]').click()
      assert.equal(calls,1,'Legacy click handler must run once')
    }
  } finally {dom.window.close()}
})

test('mapped assets exist, scripts parse, and optional migration hashes match',async()=>{
  const assets=JSON.parse(await readFile(new URL('../assets-manifest.json',import.meta.url)))
  const before=JSON.parse(await readFile(new URL('./fixtures/published-assets.json',import.meta.url)))
  for(const asset of before) {
    const source=assets.find(a=>a.folder===asset.folder && a.file===asset.file)
    assert.ok(source,asset.folder+'/'+asset.file)
    const contents=await readFile(new URL('../'+source.source,import.meta.url))
    if(process.env.VERIFY_ORGANIZATION==='1') assert.equal(hash(contents),asset.hash,asset.file)
    if(asset.file.endsWith('.js')) new vm.Script(contents.toString())
  }
})
