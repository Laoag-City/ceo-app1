// Public portal destinations only. Database credentials never enter this response.
function publicOrigin(value, key) {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
            url.pathname !== '/' || url.search || url.hash) throw Error();
        return url.origin;
    } catch {
        throw Error(key + ' must be an HTTP(S) origin without a path or credentials.');
    }
}

module.exports = function registerOfficeServices(app, current, env = process.env) {
    const settings = {
        permits: publicOrigin(env.PERMIT_PUBLIC_ORIGIN, 'PERMIT_PUBLIC_ORIGIN'),
        queue: publicOrigin(env.QUEUE_PUBLIC_ORIGIN, 'QUEUE_PUBLIC_ORIGIN')
    };
    if (env.RENDER_EXTERNAL_URL) {
        settings.current = current;
        settings[current] ||= publicOrigin(env.RENDER_EXTERNAL_URL, 'RENDER_EXTERNAL_URL');
    }
    app.get(['/office-services.js', '/portal-assets/office-services.js'], (req, res) => {
        res.set('Cache-Control', 'no-store');
        // Escape HTML metacharacters even though this is a standalone JS response.
        const data = JSON.stringify(settings).replace(/[<>&\u2028\u2029]/g,
            character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
        res.type('application/javascript').send('window.officeServiceOrigins=' + data + ';');
    });
};
