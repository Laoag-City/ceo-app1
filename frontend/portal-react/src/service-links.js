export function serviceOrigin(service, location, settings = {}) {
  const configured = settings[service.id]
  if (configured) {
    try {
      const url = new URL(configured)
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
          url.pathname === '/' && !url.search && !url.hash) return url.origin
    } catch {}
    return null
  }
  if (settings.current) return settings.current === service.id ? location.origin : null
  return `${location.protocol}//${location.hostname}:${service.port}`
}
