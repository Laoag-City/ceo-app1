// bcrypt only uses the first 72 UTF-8 bytes. Never silently truncate passwords.
module.exports = function passwordPolicy(value) {
    return typeof value !== 'string' || value.length < 6 || Buffer.byteLength(value, 'utf8') > 72
        ? 'Use at least 6 characters and no more than 72 UTF-8 bytes for your password.' : null;
};
