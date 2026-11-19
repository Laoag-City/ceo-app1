// Guides describe the existing workflow; opening help never performs an action.
export const helpTopics = {
 'permit-approval-inbox': {
  title:'Review the approval inbox',system:'Permit Management',roles:['admin'],
  summary:'Review pending edits, permit and inspection deletions, and projects ready for final approval in one place.',
  steps:['Choose a request type and Building or Occupancy. Submitted requests appear oldest first; automatic final reviews follow.','Open Review to inspect the latest submitted changes or deletion scope. Approve or decline, then confirm your decision. Delete All requires typing DELETE ALL.','For final approval, review all main and sub-permit stations in the existing project review dialog. Enter remarks when returning a project for correction.'],
  note:'A request can become outdated while another admin is reviewing it. Refresh its details before retrying. Final-review entries are created by station readiness and have no separate requester or submission date.'
 },
 'permit-monthly-reports': {
  title:'Monthly permit reports',system:'Permit Management',roles:['admin'],
  summary:'Summarize applications and recorded review decisions for a selected month.',
  steps:['Choose the reporting month and permit type. The current month includes dates up to today in Manila.','Use Summary for totals and processing time, or Detailed records to inspect the applications behind those totals.','Export Excel or CSV for every matched record. Open Print summary to print or save a PDF.'],
  note:'Filing counts use filing dates. Approvals and corrections use action dates and may relate to earlier applications. Each parent permit counts once per metric; incomplete applications are excluded from the processing-time average.'
 },
 'permit-create': {
  title:'Create a permit', system:'Permit Management', roles:['operator'],
  summary:'Building and Occupancy permits start with their standard routing stations.',
  steps:['Open the Building or Occupancy registry and choose Create permit.','Enter the project, applicant, location, and application details. For Occupancy, include the building permit reference.','Save the permit, then open its routing workspace to follow the station reviews. Use Edit contact details to save phone and email corrections directly.'],
  note:'Creating a permit does not approve it. Each required station must complete its review before the admin gives final approval.'
 },
 'permit-stations': {
  title:'Edit your assigned stations', system:'Permit Management', roles:['operator'],
  summary:'Your role and station assignments determine which routing rows you can edit.',
  steps:['Open the permit and choose Edit in the routing matrix.','Update the status, review dates, and remarks for your assigned stations.','Save the routing updates. Check the project status to see whether it is ready for the admin’s final review.'],
  note:'Other stations remain view only. If your station is missing from your account, ask the IT superadmin to update your Stations assignments.'
 },
 'permit-engineer': {
  title:'Why Assigned Engineer is read only', system:'Permit Management', roles:['operator','admin'],
  summary:'The engineer name follows the operator who last saved an actual change to that station.',
  steps:['An operator assigned to the station changes its status, dates, or remarks and saves.','That operator becomes the displayed Assigned Engineer. Saving without changing station details does not replace the engineer.','The displayed name follows that operator’s Display name in My Profile.'],
  note:'Several operators can share a station. The engineer field is filled automatically; you do not type a name into it.'
 },
 'permit-progress': {
  title:'Station approval and final approval', system:'Permit Management', roles:['operator','admin'],
  summary:'Approved stations make the project ready for final review. The admin makes the final project decision.',
  steps:['Each required station completes its review and records its status.','When every required station is Approved, the project becomes ready for final review.','The admin reviews the station details and gives final approval, or returns the project with correction remarks.'],
  note:'Changes to approved project or station details require a fresh final review. Earlier decisions remain in Final review history.'
 },
 'permit-remarks': {
  title:'Read and save station remarks', system:'Permit Management', roles:['operator'],
  summary:'Remarks explain station findings, missing information, and requested corrections.',
  steps:['Use See remarks in the routing overview or View remarks in the routing table to open the full text in a popup.','To change your station’s remarks, enter editing mode and choose Edit remarks.','Apply the remarks to the row, then save the routing updates to record the change.'],
  note:'Applying text in the remarks editor is part of editing the matrix. Save the routing updates to keep it.'
 },
 'permit-deletion': {
  title:'Delete all permit records', system:'Permit Management', roles:['operator','admin'],
  summary:'Admins delete records immediately after confirmation. Operators send deletion requests for admin approval.',
  steps:['Review the registry and its record count. Delete All covers the entire Building or Occupancy registry, including records outside the current search or filter.','Choose Delete all permit records and type DELETE ALL. For admins, confirming permanently deletes those permits and their related records immediately.','For operators, confirming sends a request. Records remain available until an admin approves it.'],
  note:'The other permit registry is unaffected. Admin deletions and operator deletion requests are recorded in admin history.'
 },
 'permit-final-review': {
  title:'Give final approval or request corrections', system:'Permit Management', roles:['admin'],
  summary:'Review the whole project before recording the final decision.',
  steps:['Open Review project under Final Project Review and read the main permit and any sub-permit station details.','When the project is ready, choose Give final approval, then Confirm final approval. The saved decision appears in Final review history.','If correction is needed before final approval, enter Review remarks and choose Return for correction.'],
  note:'A finally approved project is read only in this review. Project or station changes require another final review; previous decisions are retained.'
 },
 'account-stations': {
  title:'Assign stations to operators', system:'User Account Management', roles:['superadmin'],
  summary:'An operator can have several stations, and several operators can share a station.',
  steps:['Find the operator under Manage Accounts and choose Stations.','Tick every station that operator may edit. Clear a tick to remove that station permission.','Choose Save stations to apply the selected assignments. Cancel leaves the saved assignments unchanged.'],
  note:'An operator with no assigned stations can view routing details but cannot edit station rows. Assigned Engineer follows the last operator who saves an actual station change.'
 },
 'account-management': {
  title:'Manage user accounts', system:'User Account Management', roles:['superadmin'],
  summary:'The superadmin manages accounts, roles, activation, and station assignments.',
  steps:['Review new registrations under Account Requests and accept or decline each request.','Use Manage Accounts to create accounts or update a user’s role and activation.','Assign Stations to operators so they can edit the appropriate routing rows.'],
  note:'You cannot delete or deactivate your own signed-in account. Permit decisions belong to the admin’s project review workspace.'
 },
 'queue-start': {
  title:'Choose a queue workstation', system:'Queue Management',
  summary:'Each workstation has a specific job in the visitor workflow.',
  steps:['Choose Registration Desk to select a service and issue tickets.','Choose Window 1 for receiving Building and Occupancy permit applications and inquiries, Window 2 for Occupancy permit releasing, or Window 3 for Building permit releasing.','Open Monitor Display for the public queue screen, or Service Summary to count tickets issued for each service.'],
  note:'A service window may already be in use. Return to workstations when you finish so another staff member can use your window.'
 },
 'queue-registration': {
  title:'Register a visitor and issue a ticket', system:'Queue Management',
  summary:'The requested service determines which window receives the ticket.',
  steps:['Select the requested service: releasing, receiving, or an inquiry.','Click Get ticket. No applicant or contact details are collected at this desk.','Give the issued ticket number to the visitor. It appears in the appropriate window’s Waiting list.'],
  note:'Check the selected service before submitting so the visitor joins the correct waiting line.'
 },
 'queue-actions': {
  title:'Next, Hold, and Drop tickets', system:'Queue Management',
  summary:'These controls act on tickets at your service window.',
  steps:['Next ticket moves the current client to Finished and calls the next waiting client. If you have no current client, it calls the first waiting ticket.','Hold ticket pauses the current client and moves that ticket to your On hold list.','Drop ticket removes the ticket from the active queue after confirmation. The issued ticket remains included in Service Summary.'],
  note:'If no one is waiting, Next ticket still finishes the current client and leaves the window available. Holding your client does not remove another window’s waiting tickets.'
 },
 'queue-held': {
  title:'Bring back a held ticket', system:'Queue Management',
  summary:'Choose the held ticket itself to resume that client at the same window.',
  steps:['Open the On hold tab at your service window.','Select the ticket you want to resume.','That ticket becomes your current client. If you were serving another client, that client moves to Finished.'],
  note:'Resuming a held ticket calls that specific client. It does not call the first ticket in Waiting.'
 },
 'queue-recall': {
  title:'Call the current client again', system:'Queue Management',
  summary:'Call again repeats the announcement for the ticket you are already serving.',
  steps:['Check the ticket number under Now serving.','Choose Call again if the client needs another announcement.','Use Ticket details to review the ticket number and requested service without changing its queue position.'],
  note:'Call again does not finish the client or advance to another ticket. Use Next ticket when service is complete.'
 },
 'queue-history': {
  title:'Count tickets by requested service', system:'Queue Management',
  summary:'Service Summary shows how many tickets were issued for each service.',
  steps:['Today is selected initially. Choose From and To dates and click Apply dates for another range.','Read the count for each requested service and the total tickets issued. Services with no tickets show zero.','Use Refresh to load the latest counts. Calling, recalling, holding, or completing a ticket does not add to the issued count.'],
  note:'Queue resets retain these totals. Personal details are not displayed in this summary.'
 },
 'queue-reset': {
  title:'Reset the entire queue', system:'Queue Management',
  summary:'Reset entire queue affects every service window and clears workstation assignments.',
  steps:['Use Queue maintenance only when the entire active queue needs to be cleared.','Read the confirmation, type RESET, and confirm the reset.','Sign in to your workstation again. Ticket numbering starts again at 1001.'],
  note:'Service Summary retains counts for previously issued tickets. Activity logs and uploaded videos are retained.'
 }
}

export function helpForPage(page, role, workspace, resetVisible=false) {
 if(page==='permits-approval-inbox')return {start:'permit-approval-inbox',topics:role==='admin'?['permit-approval-inbox','permit-final-review','permit-deletion']:[]}
 if(page==='permits-monthly-reports')return {start:'permit-monthly-reports',topics:role==='admin'?['permit-monthly-reports']:[]}
 if (page==='queue-log-in') return {start:'queue-start', topics:['queue-start','queue-registration','queue-actions','queue-held','queue-recall','queue-history']}
 if (page==='queue-kiosk') return {start:workspace==='Kiosk'?'queue-registration':'queue-actions',topics:workspace==='Kiosk'?['queue-registration','queue-start']:['queue-actions','queue-held','queue-recall','queue-start',...(resetVisible?['queue-reset']:[])]}
 if (page==='queue-client-history') return {start:'queue-history',topics:['queue-history','queue-start']}
 if (page==='permits-superadmin' && role==='superadmin') return {start:'account-management',topics:['account-management','account-stations']}
 if (page==='permits-superadmin') return {start:'permit-final-review',topics:['permit-final-review','permit-progress','permit-engineer','permit-deletion']}
 const topics=['permit-create','permit-stations','permit-engineer','permit-progress','permit-remarks','permit-deletion'].filter(key=>helpTopics[key].roles.includes(role || 'operator'))
 const start=page.includes('edit')?'permit-stations':'permit-create'
 return {start:topics.includes(start)?start:topics[0],topics}
}
