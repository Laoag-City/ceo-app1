import {test} from 'node:test'
import assert from 'node:assert/strict'
import {serviceOrigin} from '../../src/service-links.js'
const permits={id:'permits',port:3000},queue={id:'queue',port:5000}
const local={protocol:'http:',hostname:'192.168.1.10',origin:'http://192.168.1.10:5000'}
test('office LAN links retain the current hostname and service ports',()=>{
 assert.equal(serviceOrigin(permits,local),'http://192.168.1.10:3000')
 assert.equal(serviceOrigin(queue,local),'http://192.168.1.10:5000')
})
test('cloud links use HTTPS service origins without attaching local ports',()=>{
 const location={protocol:'https:',hostname:'queue.onrender.com',origin:'https://queue.onrender.com'}
 const settings={current:'queue',permits:'https://permit.onrender.com/',queue:'https://queue.onrender.com'}
 assert.equal(serviceOrigin(permits,location,settings),'https://permit.onrender.com')
 assert.equal(serviceOrigin(queue,location,settings),location.origin)
 assert.equal(serviceOrigin(queue,location,{current:'queue'}),location.origin)
 assert.equal(serviceOrigin(permits,location,{current:'queue'}),null)
 assert.equal(serviceOrigin(permits,location,{permits:'javascript:alert(1)'}),null)
})
