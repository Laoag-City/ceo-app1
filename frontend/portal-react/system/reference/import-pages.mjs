throw new Error('Historical migration tool. Do not run: use features/ and the current publisher.');
// One-time import. Refuses to overwrite React sources after migration.
import { parse } from 'parse5'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(here, '../..')
const groups = {
  permits: ['monitorBP frontend', ['login','occupancy_login','admin-login','index','occupancy','edit','occupancy_edit','superadmin']],
  queue: ['queue frontend', ['log-in','kiosk','monitor','audit-logs','secret-management']],
}
const boolean = new Set('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split(' '))
const names = { class:'className', for:'htmlFor', tabindex:'tabIndex', readonly:'readOnly', autofocus:'autoFocus', maxlength:'maxLength', minlength:'minLength', colspan:'colSpan', rowspan:'rowSpan', autocomplete:'autoComplete', novalidate:'noValidate', formnovalidate:'formNoValidate', cellpadding:'cellPadding', cellspacing:'cellSpacing', playsinline:'playsInline', frameborder:'frameBorder', allowfullscreen:'allowFullScreen', crossorigin:'crossOrigin', datetime:'dateTime', contenteditable:'contentEditable', spellcheck:'spellCheck', srcset:'srcSet', usemap:'useMap', acceptcharset:'acceptCharset', 'http-equiv':'httpEquiv' }
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
function jsx(node, depth=1) {
  if (node.nodeName === '#comment') return ''
  if (node.nodeName === '#text') return node.value ? `{${JSON.stringify(node.value)}}` : ''
  const tag = node.tagName
  if (!tag || tag === 'script') return ''
  const bridge = {}, props = []
  for (const {name, value} of node.attrs) {
    if (/^on/i.test(name) || name === 'style' || name === 'selected' || name === 'autofocus') { bridge[name] = value; continue }
    let prop = names[name] || name
    if (node.namespaceURI?.includes('svg') && !/^(aria|data)-/.test(prop)) prop = prop.replace(/[-:]([a-z])/g, (_, char) => char.toUpperCase())
    if (name === 'autoplay') prop = 'autoPlay'
    if (name === 'checked') prop = 'defaultChecked'
    if (name === 'value' && tag === 'input') prop = 'defaultValue'
    if (boolean.has(name)) props.push(`${prop}={true}`)
    else props.push(`${prop}={${JSON.stringify(value)}}`)
  }
  if (tag === 'textarea') props.push(`defaultValue={${JSON.stringify((node.childNodes || []).map(n => n.value || '').join(''))}}`)
  if (Object.keys(bridge).length) props.push(`ref={legacyAttributes(${JSON.stringify(bridge)})}`)
  const opening = `<${tag}${props.length ? ' ' + props.join(' ') : ''}`
  if (voids.has(tag)) return opening + ' />'
  const children = tag === 'textarea' ? '' : (node.childNodes || []).map(n => jsx(n,depth+1)).join('')
  return `${opening}>${children}</${tag}>`
}
const manifest=[]
await mkdir(path.join(here,'pages'),{recursive:true})
await mkdir(path.join(here,'originals'),{recursive:true})
for (const [group,[folder,files]] of Object.entries(groups)) for (const file of files) {
  const id = `${group}-${file}`
  const destination = path.join(here,'pages',id+'.jsx')
  try { await access(destination); throw new Error(`Refusing to overwrite ${destination}`) } catch(e) { if(e.code !== 'ENOENT') throw e }
  const html = await readFile(path.join(frontend,folder,file+'.html'),'utf8')
  const doc=parse(html,{sourceCodeLocationInfo:true})
  const body=doc.childNodes.find(n=>n.tagName==='html').childNodes.find(n=>n.tagName==='body')
  const scripts=[]
  function collect(n) { if(n.tagName==='script') scripts.push(html.slice(n.sourceCodeLocation.startOffset,n.sourceCodeLocation.endOffset)); else (n.childNodes || []).forEach(collect) }
  body.childNodes.forEach(collect)
  const component = `import React from 'react'\nimport { legacyAttributes } from '../legacy-attributes'\n\n// Layout is React-owned at mount; existing controllers own interactive regions.\nexport default function Page() {\n  return <>${body.childNodes.map(n=>jsx(n)).join('')} </>\n}\n`
  await writeFile(destination,component)
  await writeFile(path.join(here,'originals',id+'.html'),html)
  const shell=html.slice(0,body.sourceCodeLocation.startTag.endOffset)+`\n<div id="system-react-root" data-page="${id}" style="display:contents"></div>\n<script src="/system-react/app.js"></script>\n`+scripts.join('\n')+html.slice(body.sourceCodeLocation.endTag.startOffset)
  await writeFile(path.join(here,'pages',id+'.html'),shell)
  manifest.push({id,folder,file:file+'.html'})
}
await writeFile(path.join(here,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
await writeFile(path.join(here,'pages.js'),manifest.map((p,i)=>`import Page${i} from './pages/${p.id}.jsx'`).join('\n')+'\nexport default {\n'+manifest.map((p,i)=>`${JSON.stringify(p.id)}: Page${i}`).join(',\n')+'\n}\n')
console.log(`Imported ${manifest.length} page layouts; live files are not changed.`)
