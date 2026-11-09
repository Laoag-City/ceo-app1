import React from 'react'

export default function PermitAgingFilter() {
  return <div className="registry-filter-field">
      <label htmlFor="registryAging">Follow-up</label>
      <select id="registryAging">
        <option value="all">All aging indicators</option>
        <option value="attention">Needs follow-up</option>
        <option value="overdue">Overdue only</option>
        <option value="unknown">Check dates</option>
      </select>
    </div>
}

export function PermitAgingPolicy() {
  return <p className="permit-aging-policy" id="registryAgingPolicy" aria-live="polite">Calendar-day indicators based on filing and recorded activity.</p>
}
