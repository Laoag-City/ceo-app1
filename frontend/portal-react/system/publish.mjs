/**
 * MAINTAINER GUIDE
 * Publishes system page shells and the compiled React layout bundle to both Express static directories.
 * Edit system/features, shared, or assets, then build and publish.
 * The two server static folders are generated deployment copies.
 */
import { readFile, copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const here=path.dirname(fileURLToPath(import.meta.url))
const frontend=path.resolve(here,'../..')
const manifest=JSON.parse(await readFile(path.join(here,'manifest.json'),'utf8'))
const assets=JSON.parse(await readFile(path.join(here,'assets-manifest.json'),'utf8'))
for(const folder of new Set(manifest.map(p=>p.folder))) {
  await mkdir(path.join(frontend,folder,'system-react'),{recursive:true})
  await copyFile(path.join(here,'../system-dist/app.js'),path.join(frontend,folder,'system-react/app.js'))
}
for(const page of manifest) await copyFile(path.join(here,page.source+'.html'),path.join(frontend,page.folder,page.file))
for(const asset of assets) await copyFile(path.join(here,asset.source),path.join(frontend,asset.folder,asset.file))
console.log(`Published ${manifest.length} React layouts. Backend files unchanged.`)

// Shared login shell, with server-protected workstation selection.
await copyFile(path.join(here,'features/queue/login.html'),path.join(frontend,'queue frontend/workstations.html'))
