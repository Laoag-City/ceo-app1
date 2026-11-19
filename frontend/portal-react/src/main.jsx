/**
 * MAINTAINER GUIDE
 * Standalone portal UI and links to the two local systems.
 * Permit Management opens the shared permit login; queue services use their workstation-selection flow. This portal routes visitors but does not merge the two databases.
 */
  import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, ArrowRight, Building2, UsersRound, Sun, Moon, RefreshCw, ShieldCheck, MapPin } from 'lucide-react'
import { Button } from './components/ui/button'
import './style.css'
import { serviceOrigin } from './service-links'

const services = [
  { id: 'permits', number: '01', category: 'PERMIT SERVICES', title: 'Permit Management', description: 'From application to approval. Access building and occupancy records in one place.', tags: ['Building permits', 'Occupancy permits', 'Administration'], image: '/assets/permit-portal-cover.png', icon: Building2, port: 3000, path: '/login', action: 'Open permit system' },
  { id: 'queue', number: '02', category: 'PUBLIC SERVICE OPERATIONS', title: 'Queue Management', description: 'Keep every visit moving. Manage tickets, service counters, and your live queue.', tags: ['Visitor tickets', 'Service counters', 'Live monitor'], image: '/assets/queue-portal-cover.png', icon: UsersRound, port: 5000, path: '/log-in.html', action: 'Open queue system' },
]
function initialTheme() {
  try {
    const cookie = document.cookie.split('; ').find(item => item.startsWith('engineeringTheme='))?.split('=')[1]
    const stored = cookie || localStorage.getItem('engineeringTheme') || localStorage.getItem('engineeringPortalTheme')
    return stored === 'dark' ? 'dark' : 'light'
  } catch { return 'light' }
}
function App() {
  const [theme, setTheme] = useState(initialTheme)
  const previousTheme = useRef(theme)
  const [now, setNow] = useState(new Date())
  const [statuses, setStatuses] = useState({ permits: 'checking', queue: 'checking' })
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const root = document.documentElement
    let transitionTimer
    // Skip the initial render and honor the device's reduced-motion setting.
    if (previousTheme.current !== theme && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-transitioning')
      getComputedStyle(document.body).backgroundColor
      transitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), 460)
    }
    previousTheme.current = theme
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.portalTheme = theme
    try { document.cookie = `engineeringTheme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax` } catch {}
    try { localStorage.setItem('engineeringTheme', theme); localStorage.setItem('engineeringPortalTheme', theme) } catch {}
    return () => { clearTimeout(transitionTimer); root.classList.remove('theme-transitioning') }
  }, [theme])
  useEffect(() => {
    const sync = () => setTheme(initialTheme())
    const storage = event => { if (event.key === 'engineeringTheme') sync() }
    const visible = () => { if (!document.hidden) sync() }
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    let mounted = true
    const controllers = new Set()
    async function check() {
      await Promise.all(services.map(async service => {
        const { id } = service
        const origin = serviceOrigin(service, window.location, window.officeServiceOrigins)
        if (!origin) { if (mounted) setStatuses(previous => ({ ...previous, [id]: 'offline' })); return }
        const controller = new AbortController(); controllers.add(controller)
        const timeout = setTimeout(() => controller.abort(), 3500)
        let status = 'offline'
        try { const response = await fetch(`${origin}/api/health`, { signal: controller.signal, cache: 'no-store' }); if (response.ok) status = 'online' } catch {}
        finally { clearTimeout(timeout); controllers.delete(controller) }
        if (mounted) setStatuses(previous => ({ ...previous, [id]: status }))
      }))
    }
    setStatuses({ permits: 'checking', queue: 'checking' }); check()
    const interval = setInterval(check, 30000)
    return () => { mounted = false; clearInterval(interval); controllers.forEach(controller => controller.abort()) }
  }, [refresh])
  const timeOptions = { timeZone: 'Asia/Manila' }
  return <div className="portal">
    <span className="office-sun-rays" aria-hidden="true" />
    <a className="skip-link" href="#services">Skip to services</a>
    <header className="site-header"><div className="header-content">
      <div className="brand"><img src={`${import.meta.env.BASE_URL}assets/laoag-city-official-seal.png`} alt="City of Laoag seal"/><div><strong>Office of the City Engineer</strong><span>City Government of Laoag</span></div></div>
      <div className="clock"><strong>{now.toLocaleTimeString('en-US', timeOptions)}</strong><span>{now.toLocaleDateString('en-US', { ...timeOptions, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
      <Button size="icon" className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun/> : <Moon/>}</Button>
    </div></header>
    <main id="services" aria-label="Office systems">
      <div className="service-grid">{services.map(service => <ServiceCard key={service.id} service={service} status={statuses[service.id]}/>)}</div>
      <div className="support-strip"><div><ShieldCheck size={17}/><span>Authorized personnel only<span className="support-detail"> · Sign in to your workspace to continue.</span></span></div><Button variant="ghost" onClick={() => setRefresh(value => value + 1)} disabled={Object.values(statuses).includes('checking')}><RefreshCw className={Object.values(statuses).includes('checking') ? 'refreshing' : ''}/>Refresh status</Button></div>
    </main>
    <footer>
      <span className="footer-description">
        <span>Office of the City Engineer <span className="footer-dot">/</span> Systems portal</span>
        <span>Developed by Gabriel C. Gamo &amp; Sherwin Angelo E. Pesado - MMSU CCIS BSIT</span>
      </span>
      <span><MapPin size={13}/> Laoag City, Philippines</span>
    </footer>
  </div>
}
function ServiceCard({ service, status }) {
  const Icon = service.icon
  const origin = serviceOrigin(service, window.location, window.officeServiceOrigins)
  const href = origin ? origin + service.path : undefined
  return <a className={`service-card ${service.id}`} href={href} aria-disabled={!href || undefined} aria-label={service.action}>
    <div className="card-photo"><img src={`${import.meta.env.BASE_URL}${service.image.slice(1)}`} alt=""/><div className="photo-shade"/><span className="photo-index">{service.number} / OFFICE SYSTEM</span><span className="photo-link" aria-hidden="true"><ArrowUpRight size={22}/></span><span className="photo-caption">{service.id === 'permits' ? 'Building a better city.' : 'Every visit matters.'}</span></div>
    <div className="card-content"><div className="card-top"><span className="service-symbol"><Icon size={22}/></span><span className={`service-status ${status}`} role="status"><i/>{status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking'}</span></div>
      <p className="category">{service.category}</p><h2>{service.title}</h2><p className="description">{service.description}</p>
      <div className="tags">{service.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="card-action"><span>{service.action}</span><ArrowRight size={19}/></div>
    </div>
  </a>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
