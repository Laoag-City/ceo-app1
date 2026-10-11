const staffRoles = new Set(['operator', 'admin', 'superadmin']);
const publicTicket = ticket => ticket && ({id:ticket.id, reason:ticket.reason,
    calledBy:ticket.calledBy, timestamp:ticket.timestamp, recallStamp:ticket.recallStamp});

function publicState(state) {
    return {queue:state.queue.map(publicTicket), waiting:state.waiting.map(publicTicket),
        onHold:state.onHold.map(publicTicket), serving:state.serving.map(publicTicket),
        finished:[], nowServing:publicTicket(state.nowServing)};
}

module.exports = function createQueueDelivery(sessions) {
    return async function sendQueueState(socket, state) {
        // Check again on every update: a logout, expiry or role revocation also
        // revokes an already-connected socket. Client-provided roles grant nothing.
        const req = {headers:{cookie:socket.request?.headers?.cookie || ''}};
        let available = false;
        const res = {status(){return this;},json(){}};
        await sessions.resolve(req,res,()=>{available = true;});
        socket.emit('queueUpdate', available && staffRoles.has(req.user?.role) ? state : publicState(state));
    };
};
module.exports.publicState = publicState;
