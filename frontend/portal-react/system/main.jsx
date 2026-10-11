/**
 * MAINTAINER GUIDE
 * Hybrid React entry point for the permit and queue pages.
 * React creates the initial DOM synchronously; classic controller scripts then own interactive mutations. Do not add root rerenders or StrictMode without migrating those controllers first.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import pages from './pages'
import PermitSidebar from './shared/PermitSidebar'
import AccountTools from './features/accounts/AccountTools'
import PermitTransfer from './features/transfer/PermitTransfer'
import OfficeSunRays from './shared/OfficeSunRays'
import ContextHelp from './shared/ContextHelp'
import SessionNotice from './shared/SessionNotice'

const host = document.getElementById('system-react-root')
const Page = pages[host.dataset.page]
if (!Page) throw new Error('Unknown system page: ' + host.dataset.page)
// Classic blocking bundle: mount before the following controller scripts run,
// preserving normal DOMContentLoaded and deferred script order exactly once.
// No StrictMode replay or root rerenders around legacy controller-owned nodes.
const withSidebar = ['permits-index', 'permits-occupancy', 'permits-edit', 'permits-occupancy_edit', 'permits-superadmin'].includes(host.dataset.page)
if (withSidebar) document.body.classList.add('permit-navigation', 'permit-panel-shell')
if (host.dataset.page === 'queue-log-in') document.body.classList.add(window.location.pathname === '/workstations.html' ? 'queue-workstation-page' : 'staff-sign-in')
// Both sign-in pages and workstation selection share the body backdrop.
const withCornerBackdrop = host.dataset.page === 'queue-log-in' || document.body.classList.contains('permit-login-page')
const withHelp = withSidebar || ['queue-kiosk','queue-client-history'].includes(host.dataset.page) || (host.dataset.page === 'queue-log-in' && window.location.pathname === '/workstations.html')
flushSync(() => createRoot(host).render(<>{withSidebar && <PermitSidebar page={host.dataset.page} />}<Page /><PermitTransfer page={host.dataset.page} />{(withSidebar || host.dataset.page === 'permits-superadmin') && <AccountTools />}{withCornerBackdrop && <OfficeSunRays />}{withHelp && <ContextHelp page={host.dataset.page} />}<SessionNotice page={host.dataset.page} /></>))
host.dataset.mounted = 'true'
