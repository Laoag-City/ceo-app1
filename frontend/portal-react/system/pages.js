import Page0 from './features/auth/login.jsx'
import Page1 from './features/auth/legacy-occupancy-login.jsx'
import Page2 from './features/auth/legacy-admin-login.jsx'
import Page3 from './features/building/registry.jsx'
import Page4 from './features/occupancy/registry.jsx'
import Page5 from './features/building/details.jsx'
import Page6 from './features/occupancy/details.jsx'
import Page7 from './features/administration/dashboard.jsx'
import Page8 from './features/queue/login.jsx'
import Page9 from './features/queue/service-desk.jsx'
import Page10 from './features/queue/monitor.jsx'
import Page11 from './features/queue/audit-logs.jsx'
import Page12 from './features/queue/management.jsx'
import Page13 from './features/queue/client-history.jsx'
import QueueReports from './features/queue/reports.jsx'
export default {
"permits-login": Page0,
"permits-occupancy_login": Page1,
"permits-admin-login": Page2,
"permits-index": Page3,
"permits-occupancy": Page4,
"permits-edit": Page5,
"permits-occupancy_edit": Page6,
"permits-superadmin": Page7,
"queue-log-in": Page8,
"queue-kiosk": Page9,
"queue-monitor": Page10,
"queue-audit-logs": Page11,
"queue-secret-management": Page12,
"queue-client-history": Page13,
"queue-reports": QueueReports
}
