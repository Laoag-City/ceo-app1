import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM, VirtualConsole} from 'jsdom'

const bundle=readFileSync(new URL('../../system-dist/app.js',import.meta.url),'utf8')
const titles=[`O'Brien residence`,`House "Annex" \\ Extension`,`House" onpointerenter="window.uatInjected=true" data-padding="`,`');window.uatInjected=true;//`]
for(const kind of ['building','occupancy'])for(const role of ['operator','admin'])test(kind+' '+role+': deletion treats quoted titles as text and preserves the confirmed record',async()=>{
 const page=kind==='building'?'permits-index':'permits-occupancy'
 const dom=new JSDOM(`<div id="system-react-root" data-page="${page}"></div>`,{url:'http://localhost/',runScripts:'outside-only',virtualConsole:new VirtualConsole()})
 const w=dom.window,confirmations=[]
 try {
  w.sessionStorage.setItem('oboUser',JSON.stringify({id:1,role}))
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  w.ResizeObserver=class{observe(){}disconnect(){}}
  w.fetch=async()=>({ok:true,json:async()=>({success:true})})
  w.FormSafety={guard:(id,callback)=>callback}
  w.StationDates={summary:()=>''}
  w.ProjectIdentity={format:(type,id)=>type+'-'+id}
  w.DestructiveAction={run:options=>confirmations.push(options)}
  const rows=titles.map((project_title,index)=>({id:index+1,project_title,location:'Laoag',owner_name:'Test owner',permit_date:'2026-10-09',date_applied:'2026-10-09',bp_reference_no:'BP-1',lot_numbers:'[]',sub_permits:'[]',routing_tracks:'[]'}))
  w.RequestFeedback={fetch:async()=>({ok:true,json:async()=>kind==='building'?rows:{permits:rows,matrix:[]}})}
  w.eval(bundle)
  w.eval(readFileSync(new URL('../assets/permits/registry-filters.js',import.meta.url),'utf8'))
  w.eval(readFileSync(new URL('../assets/permits/permit-aging.js',import.meta.url),'utf8'))
  const shell=readFileSync(new URL(`../features/${kind}/registry.html`,import.meta.url),'utf8')
  const controller=[...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(script=>script.includes(kind==='building'?'function displayPaginatedRows':'function renderTable'))
  w.eval(controller)
  if(kind==='building')await w.getPermitLogs();else await w.loadData()
  for(const title of titles) {
   const row=[...w.document.querySelectorAll('.main-data-row')].find(row=>row.querySelector('.project-title-main').textContent===title)
   assert.ok(row,title)
   const button=row.querySelector('.btn-delete-record')
   assert.equal(button.hasAttribute('onclick'),false)
   assert.equal(button.hasAttribute('onpointerenter'),false)
   button.click()
   assert.ok(confirmations.at(-1).message.includes('“'+title+'”'))
   assert.ok(confirmations.at(-1).message.includes('Permit #'+(titles.indexOf(title)+1)))
  }
  assert.equal(w.uatInjected,undefined)
  assert.equal(confirmations.length,titles.length)
 } finally {w.close()}
})
