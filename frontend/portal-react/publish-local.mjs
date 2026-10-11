/**
 * MAINTAINER GUIDE
 * Publishes the standalone portal build to the existing local entry points.
 * Prunes obsolete portal hashes only after copying the current build. Keep deletion constrained to this publisher-owned asset set.
 */
import { cp, copyFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const source = fileURLToPath(new URL('./dist/', import.meta.url))
const frontend = fileURLToPath(new URL('../', import.meta.url))
const currentAssets = new Set(await readdir(path.join(source, 'assets')))
// Only publish compiled public files. Never expose source or node_modules.
for (const folder of ['', 'queue frontend', 'monitorBP frontend']) {
  const destination = path.join(frontend, folder)
  await mkdir(path.join(destination, 'portal-assets'), { recursive: true })
  await cp(path.join(source, 'assets'), path.join(destination, 'portal-assets', 'assets'), { recursive: true })
  await copyFile(path.join(source, 'index.html'), path.join(destination, 'portal.html'))
  await copyFile(path.join(source, 'office-services.js'), path.join(destination, 'office-services.js'))
  await copyFile(path.join(source, 'office-services.js'), path.join(destination, 'portal-assets', 'office-services.js'))
  // Only prune obsolete hashed build files after the new entry point is live.
  // Never recursively delete this directory: it also contains image assets.
  const assets = path.resolve(destination, 'portal-assets', 'assets')
  for (const entry of await readdir(assets, { withFileTypes: true })) {
    if (entry.isFile() && /^index-[A-Za-z0-9_-]+\.(js|css)$/.test(entry.name) && !currentAssets.has(entry.name)) {
      const obsolete = path.resolve(assets, entry.name)
      if (path.dirname(obsolete) !== assets) throw new Error('Invalid asset path')
      await unlink(obsolete)
    }
  }
}
console.log('Published React portal to existing frontend entry points.')
