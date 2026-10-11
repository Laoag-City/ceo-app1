// Serialize snapshot reads as well as delivery. Otherwise a slow authentication
// lookup (including initial connection) can publish old state after a new update.
module.exports = function queueUpdates(readState, deliver, sockets) {
    let pending = Promise.resolve();
    function run(work) {
        const update = pending.then(work);
        pending = update.catch(() => {}); // A failed update must not stop later ones.
        return update;
    }
    return {
        connect: socket => run(async () => {
            if (socket.disconnected) return;
            await deliver(socket, await readState());
        }),
        broadcast: () => run(async () => {
            const state = await readState();
            const results = await Promise.allSettled([...sockets()].filter(socket => !socket.disconnected).map(socket => deliver(socket, state)));
            if (results.some(result => result.status === 'rejected')) throw Error('A queue display could not be refreshed.');
        })
    };
};
