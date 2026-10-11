/**
 * MAINTAINER GUIDE
 * Compatibility bridge for trusted layout attributes and existing inline handlers.
 * Used only by repository-owned page markup. Never pass user-submitted HTML or handler strings into this bridge.
 */
// Temporary bridge for authored inline handlers and CSS while the existing
// workflow controllers are migrated. Only trusted source markup reaches this.
// Page roots mount once: controllers own subsequent mutations within their
// tables, forms, dialogs and live queue panels. Do not rerender those subtrees.
export function legacyAttributes(attributes) {
  return node => {
    if (node) for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  }
}
