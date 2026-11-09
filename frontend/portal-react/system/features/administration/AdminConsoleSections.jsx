import React,{useLayoutEffect} from 'react'

const views={
  adminOverview:{title:'Admin Overview',description:'Permit totals, pending work, and recent activity.'},
  finalReviews:{title:'Final Project Review',description:'Review station details and make the final project decision.'},
  buildingReview:{title:'Building Requests',description:'Review building permit changes and deletion requests.'},
  occupancyReview:{title:'Occupancy Requests',description:'Review occupancy permit changes and deletion requests.'}
}

// Switch the existing panels without unmounting them or rerendering the Page.
// Classic controllers retain their populated request lists and pending actions.
export default function AdminConsoleSections(){
  useLayoutEffect(()=>{
    const container=document.querySelector('.container'),overview=document.querySelector('.admin-overview'),grid=container?.querySelector('.console-grid')
    const panels={adminOverview:overview,finalReviews:document.getElementById('finalReviews'),buildingReview:document.getElementById('buildingReview'),occupancyReview:document.getElementById('occupancyReview')}
    if(!container||!grid||Object.values(panels).some(panel=>!panel))return
    const heading=container.querySelector('.topbar h1'),description=container.querySelector('.topbar p'),kicker=container.querySelector('.topbar .page-kicker')
    const originalTabIndex=heading?.getAttribute('tabindex'),originalRole=overview.getAttribute('role')
    let frame
    for(const panel of Object.values(panels))panel.setAttribute('data-admin-console-panel','')
    overview.setAttribute('role','main')
    function show(focus=false){
      const requested=window.location.hash.slice(1),key=Object.hasOwn(views,requested)?requested:'adminOverview',view=views[key]
      container.dataset.adminConsoleView=key
      for(const [name,panel] of Object.entries(panels)){
        const hide=name!==key
        // A hidden modal still blocks interaction until the browser closes it.
        if(hide)for(const dialog of panel.querySelectorAll('dialog[open]'))dialog.close()
        panel.hidden=hide
      }
      grid.hidden=key==='adminOverview'
      if(heading){heading.textContent=view.title;heading.setAttribute('tabindex','-1')}
      if(description)description.textContent=view.description
      if(kicker)kicker.textContent=key==='adminOverview'?'Administration':'Project review'
      document.title=view.title+' — Office of the City Engineer'
      if(focus){
        cancelAnimationFrame(frame)
        frame=requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'auto'});if(!document.querySelector('dialog[open]'))heading?.focus({preventScroll:true})})
      }
    }
    const navigate=()=>show(true)
    show();window.addEventListener('hashchange',navigate)
    return()=>{
      window.removeEventListener('hashchange',navigate);cancelAnimationFrame(frame)
      for(const panel of Object.values(panels)){panel.hidden=false;panel.removeAttribute('data-admin-console-panel')}
      grid.hidden=false;delete container.dataset.adminConsoleView
      if(heading){if(originalTabIndex===null)heading.removeAttribute('tabindex');else heading.setAttribute('tabindex',originalTabIndex)}
      if(originalRole===null)overview.removeAttribute('role');else overview.setAttribute('role',originalRole)
    }
  },[])
  return <style>{`
    [data-admin-console-view] [data-admin-console-panel][hidden],
    [data-admin-console-view] .console-grid[hidden]{display:none!important}
    [data-admin-console-view] .console-grid{grid-template-columns:minmax(0,1fr)}
    [data-admin-console-view] .console-grid>.permit-review{grid-column:1/-1}
  `}</style>
}
