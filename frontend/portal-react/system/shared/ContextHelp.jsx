import React,{useEffect,useRef,useState} from 'react'
import {helpTopics,helpForPage} from './help-topics'
import css from './context-help.css?inline'

// This island owns only its guide dialog. The permit and queue controllers
// continue to own their forms, tables, and actions, with no Page rerenders.
export default function ContextHelp({page}) {
 const [active,setActive]=useState(null),dialog=useRef(null),opener=useRef(null)
 const context=()=>{
  let role,workspace;try{role=JSON.parse(sessionStorage.getItem('oboUser') || 'null')?.role;workspace=sessionStorage.getItem('currentWorkspace')}catch{}
  return helpForPage(page,role,workspace,!!document.querySelector('.queue-maintenance:not([hidden])'))
 }
 const close=()=>dialog.current?.close()
 useEffect(()=>{
  const inserted=new Set();let timer=null
  function add(target,key,guide=false) {
   if(!target || !helpTopics[key] || !context().topics.includes(key))return
   if([...target.children].some(node=>node.dataset.contextHelp===key))return
   const button=document.createElement('button');button.type='button';button.className='context-help-button'+(guide?' context-help-guide':'');button.dataset.contextHelp=key
   button.setAttribute('aria-label',guide?'Open '+helpTopics[key].system+' guide':'Help: '+helpTopics[key].title)
   button.setAttribute('aria-haspopup','dialog');button.title=button.getAttribute('aria-label');target.append(button);inserted.add(button)
  }
  function decorate() {
   const {start}=context(),header=document.querySelector('.site-header')
   if(header && !document.querySelector('.context-help-guide')){let actions=header.querySelector('.top-bar-actions,.top-bar-controls,.theme-header-actions');if(!actions){actions=document.createElement('div');actions.className='theme-header-actions';header.append(actions)}add(actions,start,true)}
   const anchors={
    '#createPermitModal h2, #createModal h2':'permit-create',
    '.matrix-card-header .card-heading-group h2':'permit-stations',
    '#projectFinalApproval > strong':'permit-progress',
    '.registry-bulk-delete-copy > p:first-child':'permit-deletion',
    '.final-reviews > .fr-heading .fr-heading-actions, .fr-dialog-body > .fr-label':'permit-final-review',
    '#accountListSection h2, .station-assignment-help':'account-stations',
    '#accountSection h2':'account-management',
    '#serviceCountersHeading':'queue-start',
    '#registrationServiceHeading':'queue-registration',
    '.desk-action-hint':'queue-actions',
    '#heldPanel .desk-list-note':'queue-held',
    '#currentTicketHeading':'queue-recall',
    '#historyTitle':'queue-history',
    '.queue-maintenance-label':'queue-reset'
   }
   for(const [selector,key] of Object.entries(anchors))document.querySelectorAll(selector).forEach(target=>add(target,key))
   document.querySelectorAll('#matrixTableBody').forEach(body=>body.closest('table')?.querySelectorAll('th').forEach(th=>{if(/engineer/i.test(th.textContent))add(th,'permit-engineer');if(/remarks/i.test(th.textContent))add(th,'permit-remarks')}))
  }
  const schedule=()=>{if(timer===null)timer=setTimeout(()=>{timer=null;decorate()},0)}
  const observer=new MutationObserver(schedule)
  observer.observe(document.getElementById('system-react-root'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']})
  function open(event) {
   const button=event.target.closest?.('button[data-context-help]'),key=button?.dataset.contextHelp
   if(!button || !context().topics.includes(key))return
   // A help click must not submit a form, toggle a row, or call a ticket.
   event.preventDefault();event.stopPropagation();opener.current=button;setActive(key)
  }
  function walkthrough(event) { const {start}=context();if(!start)return;opener.current=event.detail?.opener;setActive(start) }
  window.addEventListener('system-walkthrough',walkthrough)
  document.addEventListener('click',open,true);schedule()
  return ()=>{observer.disconnect();clearTimeout(timer);window.removeEventListener('system-walkthrough',walkthrough);document.removeEventListener('click',open,true);for(const button of inserted)button.remove()}
 },[page])
 useEffect(()=>{if(!active)return;if(!dialog.current.open)dialog.current.showModal();else dialog.current.querySelector('h2')?.focus()},[active])
 const topic=helpTopics[active],related=context().topics.filter(key=>key!==active)
 return <><style>{css}</style><dialog ref={dialog} className="context-help-dialog" aria-label={topic?.title || 'System guide'} onCancel={event=>{event.preventDefault();close()}} onClose={()=>{setActive(null);const target=opener.current?.isConnected?opener.current:document.querySelector('.context-help-guide');target?.focus({preventScroll:true})}} onClick={event=>{if(event.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)close()}}}>
  {topic && <>
   <div className="context-help-heading"><div><p className="context-help-kicker">{topic.system} · Quick guide</p><h2 tabIndex={-1}>{topic.title}</h2></div><button type="button" className="context-help-close" aria-label="Close guide" onClick={close} autoFocus>×</button></div>
   <div className="context-help-body"><p className="context-help-summary">{topic.summary}</p><ol className="context-help-steps">{topic.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="context-help-note">{topic.note}</p>
    {!!related.length && <nav className="context-help-related" aria-label="More help"><h3>More help</h3>{related.map(key=><button type="button" key={key} onClick={()=>{setActive(key);dialog.current.querySelector('.context-help-body').scrollTop=0}}>{helpTopics[key].title}<span aria-hidden="true">›</span></button>)}</nav>}
   </div>
   <div className="context-help-footer"><span>Open Walkthrough or use the ? buttons for help.</span><button type="button" onClick={close}>Got it</button></div>
  </>}
 </dialog></>
}
