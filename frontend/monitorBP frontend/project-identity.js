/**
 * MAINTAINER GUIDE
 * Stable display formatting for separate building and occupancy primary keys.
 * BP/OP prefixes display numeric IDs without leading zeros and do not allocate IDs. Database AUTO_INCREMENT allocates them; sorting and filtering must never renumber projects.
 */
/* Stable display references for the independent database primary keys. */
(function (root) {
    function format(kind, id) {
        const prefix = { building: 'BP', occupancy: 'OP' }[kind];
        const value = String(id ?? '');
        if (!prefix || !/^[1-9]\d*$/.test(value)) return '';
        return prefix + '-' + value;
    }
    const api = { format };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ProjectIdentity = api;
})(typeof window === 'undefined' ? globalThis : window);
