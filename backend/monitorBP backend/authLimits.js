const {createHash} = require('node:crypto');

// Single-server, bounded memory limits. A multi-instance deployment needs a shared store.
// Use the actual peer address; never accept a client-supplied forwarding header here.
module.exports = function createAuthLimits({now = Date.now, maxEntries = 5000} = {}) {
    const attempts = new Map();
    const digest = value => createHash('sha256').update(value).digest('hex');
    const reject = (res, seconds) => res.set('Retry-After', String(seconds)).status(429).json({
        success: false, retryAfter: seconds,
        message: `Too many attempts. Please try again in ${seconds} seconds.`
    });
    function limit(kind) {
        return (req, res, next) => {
            const time = now();
            for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
            const ip = req.socket?.remoteAddress || 'unknown';
            const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
            const rules = kind === 'login'
                ? [[digest(JSON.stringify(['login', ip])), 100, 900000],
                   [digest(JSON.stringify(['account', ip, username])), 10, 900000]]
                : [[digest(JSON.stringify(['register', ip])), 10, 3600000]];
            const blocked = rules.map(([key, maximum]) => {
                const entry = attempts.get(key);
                return entry && entry.count >= maximum ? entry.until - time : 0;
            });
            const wait = Math.max(...blocked);
            if (wait > 0) return reject(res, Math.ceil(wait / 1000));
            if (attempts.size + rules.filter(([key]) => !attempts.has(key)).length > maxEntries)
                return reject(res, 60);
            for (const [key, , duration] of rules) {
                const entry = attempts.get(key) || {count: 0, until: time + duration};
                entry.count++;
                attempts.set(key, entry);
            }
            if (kind === 'login') {
                const key = rules[1][0];
                const entry = attempts.get(key);
                res.once('finish', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300 && attempts.get(key) === entry)
                        attempts.delete(key);
                });
            }
            next();
        };
    }
    return {login: limit('login'), register: limit('register')};
};
