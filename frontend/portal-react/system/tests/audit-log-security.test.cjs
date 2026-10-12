const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../features/queue/audit-logs.html'),'utf8');
const controller=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(code=>code.includes('function fetchLogs()'));
const markup='<img src=x onerror="window.securityProbe=true">';
const logs=[
 {timestamp:'2026-10-12T00:00:00Z',user_station:markup,action:markup,details:'Ticket for '+markup},
 {timestamp:'2026-10-12T01:00:00Z',user_station:'Window 2',action:'TICKET_CREATED',details:`O'Brien "Annex" \\ Test`}
];
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
function fixture() {
 const dom=new JSDOM('<select id="filterStation"><option value="">All Stations</option></select><select id="filterAction"><option value="">All Actions</option></select><input id="filterSearch"><input id="filterStartDate"><input id="filterEndDate"><input id="autoRefreshToggle" type="checkbox"><div id="statsRow"></div><table><tbody id="logsTableBody"></tbody></table><p id="logFooter"></p>',
  {url:'http://localhost:5000/audit-logs.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const w=dom.window;
 w.RequestFeedback={fetch:async()=>({json:async()=>({success:true,logs})}),report(){}};
 w.eval(controller);
 return {dom,w};
}
test('audit record fields render as literal text without elements or event handlers',async()=>{
 const {dom,w}=fixture();
 try {
  w.fetchLogs();await flush();
  const rows=w.document.querySelectorAll('#logsTableBody tr');assert.equal(rows.length,2);
  assert.equal(rows[0].cells[1].textContent,markup);
  assert.equal(rows[0].cells[2].textContent,markup);
  assert.equal(rows[0].cells[3].textContent,'Ticket for '+markup);
  assert.equal(rows[1].cells[3].textContent,logs[1].details);
  assert.ok(rows[0].cells[2].querySelector('.action-default'));
  assert.ok(rows[1].cells[2].querySelector('.action-TICKET_CREATED'));
  assert.equal(w.document.querySelectorAll('#logsTableBody img, #logsTableBody [onerror]').length,0);
  assert.equal(w.securityProbe,undefined);
  assert.equal([...w.document.getElementById('filterStation').options].some(option=>option.textContent===markup),true);
 } finally {dom.window.close();}
});
test('search, manual refresh and failed refresh preserve safe audit rows',async()=>{
 const {dom,w}=fixture();
 try {
  w.fetchLogs();await flush();
  w.document.getElementById('filterSearch').value='Annex';w.applyFilters();
  assert.equal(w.document.querySelectorAll('#logsTableBody tr').length,1);
  assert.equal(w.document.querySelector('#logsTableBody tr').cells[3].textContent,logs[1].details);
  w.document.getElementById('filterSearch').value='';w.applyFilters();
  w.RequestFeedback.fetch=async()=>{throw Error('Fixture unavailable')};
  w.fetchLogs();await flush();
  assert.equal(w.document.querySelectorAll('#logsTableBody tr').length,2);
  assert.equal(w.document.querySelectorAll('#logsTableBody img').length,0);
  assert.match(w.document.getElementById('logFooter').textContent,/Refresh failed/);
  w.renderTable([]);assert.match(w.document.getElementById('logsTableBody').textContent,/No matching/);
 } finally {dom.window.close();}
});
