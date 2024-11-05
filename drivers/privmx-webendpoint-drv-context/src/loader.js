function loadDriverWebContext() {
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        importScripts('driver-web-context.js');
    }
}
loadDriverWebContext();