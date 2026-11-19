// Offline visual fixture. Uses sample tickets and never connects to the database.
import {readFileSync, writeFileSync} from 'node:fs'
const base = 'system/'
const shell = readFileSync(base + 'features/queue/monitor.html', 'utf8')
let controller = [...shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes("socket.on('queueUpdate'"))
controller = controller.replace("sessionStorage.getItem('currentWorkspace')", "'Monitor'")
const clock = [...shell.matchAll(/<script\b[^>]*data-philippine-clock[^>]*>([\s\S]*?)<\/script>/g)][0][1]
const styles = ['queue/monitor-style.css','queue/queue-ui.css','common/shared-header.css','common/status-badges.css','common/appearance.css','queue/queue-workspace.css'].map(file => readFileSync(base + 'assets/' + file, 'utf8').replace(/@import[^;]+;/g, '')).join('\n')
const seal = 'data:image/png;base64,' + readFileSync('public/assets/laoag-city-official-seal.png').toString('base64')
const bundle = readFileSync('system-dist/app.js', 'utf8').replaceAll('assets/laoag-city-official-seal.png', seal)
const appearance = readFileSync(base + 'assets/queue/appearance.js', 'utf8')
const ticket = (id, reason, extra={}) => ({id:'TKT-'+id, reason, ...extra})
const called = ticket(1001,'Releasing Bldg. Permit',{calledBy:'PC1',recallStamp:1})
const state = {queue:Array.from({length:18},(_,i)=>ticket(1002+i, ['Releasing Bldg. Permit','Releasing Bldg. Occupancy','Inquire'][i%3])),onHold:[ticket(1022,'Inquire'),ticket(1023,'Releasing Bldg. Occupancy')],serving:[called],nowServing:called}
const sample = `const previewState=${JSON.stringify(state)};
if(new URLSearchParams(location.search).has('empty')){previewState.queue=[];previewState.onHold=[];previewState.serving=[];previewState.nowServing=null;}
window.io=()=>({on(event,callback){if(event==='connect')setTimeout(callback,0);if(event==='queueUpdate')setTimeout(()=>callback(previewState),0);}});`
const script = value => '<script>' + value.replace(/<\/script/gi, '<\\/script') + '</script>'
writeFileSync('monitor-layout-preview.html', '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Queue monitor layout preview — sample tickets</title><style>'+styles+'</style>'+script(appearance)+'</head><body class="queue-monitor-page"><div id="system-react-root" data-page="queue-monitor" style="display:contents"></div>'+script(bundle)+script(sample)+script(controller)+script(clock)+'</body></html>')
console.log('Saved offline monitor preview with sample tickets.')
