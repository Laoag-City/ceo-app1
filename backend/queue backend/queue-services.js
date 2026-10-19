// Keep ticket intake and workstation authorization on the same service list.
const tasks = Object.freeze({
    PC1: Object.freeze(['Receiving Bldg. Permit', 'Receiving Bldg. Occupancy', 'Inquire']),
    PC2: Object.freeze(['Releasing Bldg. Occupancy']),
    PC3: Object.freeze(['Releasing Bldg. Permit'])
});
const services = new Set(Object.values(tasks).flat());
module.exports = {tasks, isService: value => services.has(value)};
