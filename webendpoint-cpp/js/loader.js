"use strict";
function loadDriverWebContext() {
    if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
        importScripts("privmx-worker.js");
    }
}
loadDriverWebContext();
//# sourceMappingURL=loader.js.map