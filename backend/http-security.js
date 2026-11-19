const {isIP} = require('node:net');

// Direct localhost connections are the default. IT may opt into the exact IPs
// or CIDRs of a reverse proxy whose forwarding headers it controls.
function trustedProxies(env) {
    const setting = String(env.OFFICE_TRUST_PROXY || '').trim();
    if (!setting || setting.toLowerCase() === 'false') return false;
    const addresses = setting.split(',').map(value => value.trim());
    for (const value of addresses) {
        const parts = value.split('/'), family = isIP(parts[0]);
        const bits = family === 4 ? 32 : 128;
        if (!family || parts.length > 2 || (parts.length === 2 &&
            (!/^\d+$/.test(parts[1]) || Number(parts[1]) < 1 || Number(parts[1]) > bits))) {
            throw Error('OFFICE_TRUST_PROXY must list trusted proxy IP addresses or CIDRs; unrestricted and hop-count trust are disabled.');
        }
    }
    return addresses;
}

function clientAddress(req) {
    // req.ip is calculated by Express using its explicitly configured trust policy.
    // Never read a forwarding header directly. Invalid forwarded values fall back
    // to the real socket peer rather than supplying unlimited arbitrary buckets.
    const value = isIP(req.ip || '') ? req.ip : req.socket?.remoteAddress || 'unknown';
    return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
}

function reportPolicy(env) {
    const connections = new Set(["'self'"]);
    for (const [name, fallback] of [['PERMIT_PORT',3000],['QUEUE_PORT',5000]]) {
        const port = Number(env[name] || fallback);
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
            for (const host of ['localhost','127.0.0.1']) {
                connections.add(`http://${host}:${port}`);
                connections.add(`ws://${host}:${port}`);
            }
        }
    }
    for (const key of ['PERMIT_PUBLIC_ORIGIN','QUEUE_PUBLIC_ORIGIN','RENDER_EXTERNAL_URL']) {
        if (!env[key]) continue;
        const url = new URL(env[key]);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password ||
            url.pathname !== '/' || url.search || url.hash) throw Error(key+' must be an HTTP(S) origin.');
        connections.add(url.origin);
        connections.add(url.origin.replace(/^http/, 'ws'));
    }
    // This stricter resource policy is diagnostic only while existing inline
    // scripts/styles/handlers are migrated and all system pages are verified.
    return [
        "default-src 'self'",
        "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        'connect-src '+[...connections].join(' '),
        "object-src 'none'", "base-uri 'self'", "form-action 'self'"
    ].join('; ');
}

function registerHttpSecurity(app, env = process.env) {
    app.set('trust proxy', trustedProxies(env));
    app.disable('x-powered-by');
    const diagnosticPolicy = reportPolicy(env);
    app.use((req,res,next) => {
        res.set('X-Content-Type-Options','nosniff');
        res.set('Referrer-Policy','strict-origin-when-cross-origin');
        res.set('X-Frame-Options','SAMEORIGIN');
        res.set('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
        res.set('Content-Security-Policy-Report-Only',diagnosticPolicy);
        next();
    });
}

module.exports = registerHttpSecurity;
module.exports.clientAddress = clientAddress;
