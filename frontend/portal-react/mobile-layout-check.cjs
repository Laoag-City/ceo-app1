// Read-only layout QA: all traffic is served from published assets or synthetic API fixtures.
// Run explicitly with the bundled Playwright runtime. Does not start either application server.
const {chromium} = require('C:/Users/Majin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../monitorBP frontend');
const out = path.resolve(__dirname, '../../.feature-backups/mobile-ui');
fs.mkdirSync(out, {recursive:true});
const stations = ['Line & Grade','Architectural','Civil / Structural','Electrical','Mechanical','Sanitary','Plumbing','Electronics','Fire Safety'];
const matrix = stations.map((discipline_name,i)=>({id:i+1,discipline_name,engineer_name:'Engineer With a Long Display Name',signature_status:'Approved',status:'Approved',date_checked:'2026-10-01',date_approved:'2026-10-02',feedback_remarks:i===5?'Please submit the updated sanitary plans and inspection documents.':'',can_edit:true}));
const approval = {status:'ready',label:'Ready for final review',ready:true,history:[]};
const project = {id:1,project_title:'Residential Project With a Longer Title',owner_name:'Sample Client',location:'Brgy. 15, San Guillermo, Laoag City',designer_name:'Sample Designer',permit_date:'2026-10-01',date_applied:'2026-10-01',bp_reference_no:'BP-2026-0001',lot_numbers:['12345'],matrix,sub_permits:[],rejection_history:[],_version:'test',_signatureDatesSupported:true,_stationAccessSupported:true,_assignedEngineerProfileSupported:true,final_approval:approval,routing_tracks:matrix};
const people=[{id:1,username:'sampleoperator',display_name:'Sample Station Operator',role:'operator',is_active:true,assigned_stations:['Electrical','Sanitary'],status:'online',bio:'Permit services',avatar_color:'blue'},{id:2,username:'sampleit',display_name:'IT Team',role:'superadmin',is_active:true,assigned_stations:[]}];
const files = {'/':'index.html','/occupancy':'occupancy.html','/edit':'edit.html','/occupancy_edit':'occupancy_edit.html','/admin':'superadmin.html','/superadmin':'superadmin.html','/login':'login.html'};
function api(url) {
 const p=url.pathname;
 if(p==='/api/permits')return [{...project,lot_numbers:JSON.stringify(project.lot_numbers),sub_permits:'[]',routing_tracks:JSON.stringify(matrix)}];
 if(p==='/api/occupancy')return {permits:[project],matrix};
 if(/^\/api\/(permits|occupancy)\/1$/.test(p))return project;
 if(p.endsWith('/records'))return {records:[{id:1,actor_name:'Sample Operator',message:'Station approved after review.',category:'activity',created_at:'2026-10-02T08:00:00Z'}],next:null};
 if(p.endsWith('/inspections'))return {inspections:[]};
 if(p.endsWith('/checklist'))return {checklist_state:{},_version:'test'};
 if(p==='/api/auth/accounts/pending')return {success:true,users:[]};
 if(p==='/api/auth/accounts')return {success:true,users:people};
 if(p==='/api/auth/stations')return {success:true,stations};
 if(p.includes('change-requests/pending'))return {success:true,requests:[]};
 if(p==='/api/admin/overview')return {totals:{building:1,occupancy:1,buildingPending:0,occupancyPending:0,buildingDeletions:0,occupancyDeletions:0,accounts:2,pendingAccounts:0},recent:[]};
 if(p==='/api/admin/history')return {records:[],next:null};
 if(p==='/api/final-reviews')return {projects:[{...project,kind:'permits'},{...project,kind:'occupancy',id:1}]};
 if(p==='/api/profile')return {profile:people[0]};
 if(p==='/api/people')return {people,hasMore:false};
 if(p==='/api/auth/session')return {user:people[0]};
 return {success:true,records:[],templates:[]};
}
async function geometry(page,name) {
 const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && r.right>innerWidth+2 && getComputedStyle(e).position!=='fixed' && !e.closest('thead,.permit-sidebar,.workspace-tabs,.filter-tabs,.table-wrap,.matrix-table-wrap')}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right)}))}));
 console.log(name,JSON.stringify(result));
 assert.ok(result.scroll<=result.width+1, `${name}: page overflows by ${result.scroll-result.width}px`);
 const dialog=page.locator('dialog[open],.permit-modal-overlay:visible .permit-modal,.modal-overlay:visible .modal-window').first();
 if(await dialog.count()) { const r=await dialog.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=result.width+1,`${name}: dialog outside viewport`); }
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],fails=[];
 try {
 for(const width of (process.env.LAYOUT_WIDTHS||'320,390,768,1280').split(',').map(Number))for(const [route,role] of [['/','operator'],['/occupancy','operator'],['/edit?id=1','operator'],['/occupancy_edit?id=1','operator'],['/admin','admin'],['/superadmin','superadmin'],['/login','operator'],['/project-summary.html?kind=building&id=1','operator']]){
  const context=await browser.newContext({viewport:{width,height:Number(process.env.LAYOUT_HEIGHT)||844}});
  await context.addInitScript(user=>sessionStorage.setItem('oboUser',JSON.stringify(user)),{...people[0],role,id:role==='superadmin'?2:1});
  const writes=[];
  const page=await context.newPage();page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(`${width} ${route}: ${e.message}`));
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());if(u.hostname!=='permit.test')return r.abort();
   if(u.pathname.startsWith('/api/')){if(!['GET','HEAD'].includes(r.request().method()))writes.push(u.pathname);return r.fulfill({json:api(u)});}
   const file=path.join(root,files[u.pathname] || decodeURIComponent(u.pathname));
   if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:'Not found'});
   const ext=path.extname(file), types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
   return r.fulfill({body:fs.readFileSync(file),contentType:types[ext]||'application/octet-stream'});
  });
  const name=`${width}-${route.split('?')[0].replaceAll('/','')||'building'}`;
  try {
   await page.goto('http://permit.test'+route);await page.waitForTimeout(800);
   await geometry(page,name);
   if(width===390)await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
   if(width<=390 && route!=='/login' && !route.startsWith('/project-summary')){
    await page.getByRole('button',{name:'Open workspace navigation'}).click();
    await page.getByRole('button',{name:'My Profile',exact:true}).click();await page.waitForTimeout(350);
    await geometry(page,name+'-profile');
    await page.locator('.account-dialog button[aria-label]').first().click();
   }
   if(route==='/'||route==='/occupancy'){
    await page.locator('.site-header .btn-new-permit').first().click();await page.waitForTimeout(350);await geometry(page,name+'-create');
    if(width===390)await page.screenshot({path:path.join(out,name+'-create.png')});
    await page.locator('.permit-modal:visible button[type=submit],.modal-window:visible button[type=submit]').scrollIntoViewIfNeeded();
    await page.locator('.permit-modal-close:visible,.modal-close:visible').first().click();
    await page.locator('.btn-progress').first().click();await page.waitForTimeout(250);await geometry(page,name+'-progress');
   }
   if(route.includes('_edit')||route.startsWith('/edit')){
    await page.locator('#editTriggerBtn').click();await page.waitForTimeout(100);await geometry(page,name+'-editing');
    assert.ok(await page.locator('input[type=date].station-date-input').count());
    if(width===390)await page.screenshot({path:path.join(out,name+'-editing.png'),fullPage:true});
    const before=writes.length;
    await page.getByRole('button',{name:'Save Signature Updates',exact:true}).click();
    assert.equal(writes.length,before,'Unchanged station save must not submit any request');
    await page.locator('#editTriggerBtn').click();
    await page.locator('input[type=date].station-date-input').first().fill('2026-09-30');
    assert.equal(writes.length,before,'Editing a date must remain local');
    if(width===390){
     await page.locator('input[type=date].station-date-input').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'-station-controls.png')});
     await page.locator('#appearanceToggle').click();await page.waitForTimeout(500);await geometry(page,name+'-dark');await page.locator('input[type=date].station-date-input').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'-dark.png')});
    }
   }
   if(route==='/admin'){
    if(width<=390){
     await page.getByRole('button',{name:'Open workspace navigation'}).click();await page.locator('a[href="#finalReviews"]').click();
     await page.waitForTimeout(100);assert.equal(await page.getByRole('button',{name:'Open workspace navigation'}).getAttribute('aria-expanded'),'false');
    }
    await page.getByRole('button',{name:'Review project'}).first().click();await page.waitForTimeout(200);await geometry(page,name+'-review');
    await page.getByRole('button',{name:'Give final approval',exact:true}).click();await geometry(page,name+'-confirmation');
    if(width===390)await page.screenshot({path:path.join(out,name+'-confirmation.png')});
    await page.getByRole('button',{name:'Close review',exact:true}).click();
    await page.getByRole('button',{name:'View full history',exact:true}).click();await page.waitForTimeout(200);await geometry(page,name+'-history');
   }
   if(route==='/superadmin'){
    await page.getByRole('button',{name:'Assigned stations for sampleoperator'}).click();await geometry(page,name+'-stations');
   }
   if(route.startsWith('/project-summary')){
    await page.locator('#summary').waitFor({state:'visible'});await geometry(page,name+'-loaded');
    await page.emulateMedia({media:'print'});assert.equal(await page.locator('#summary table').first().evaluate(e=>getComputedStyle(e).display),'table');
   }
  }catch(e){fails.push(name+': '+e.message);console.log('FAIL',name,e.message)}finally{await context.close()}
 }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({fails,errors},null,2));
 console.log(JSON.stringify({fails,errors},null,2));if(fails.length||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
