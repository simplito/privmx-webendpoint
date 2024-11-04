
module.exports = {};

    function LoadEmscripten() {
        return new Promise((resolve, reject)=>{
        const wasmGlueUrl = (process.env.REACT_APP_CONTEXT_PATH || '') + '/lib/emscripten/EmscriptenApi.js';
        const wasmGlue = document.createElement('script');
        wasmGlue.setAttribute('id', 'emapi');
        wasmGlue.setAttribute('type', 'text/javascript');
        wasmGlue.setAttribute('src', wasmGlueUrl);
        wasmGlue.addEventListener('load', () => {
            const lib = {apiPrototype: window.apiPrototype};
            Object.assign(module.exports, lib);
            console.log('Gluecode script loaded', module.exports);
            window.dispatchEvent(new CustomEvent('wasmLoaded'));
            resolve();
        });
        document.body.append(wasmGlue);
        module.exports = {};
        });
    }
    
    function loadBindings() {
        return new Promise((resolve, reject)=>{
        const bindingsUrl = (process.env.REACT_APP_CONTEXT_PATH || '') + '/lib/emscripten/bindings.js';
        const bindings = document.createElement('script');
        bindings.setAttribute('id', 'bindings');
        bindings.setAttribute('type', 'text/javascript');
        bindings.setAttribute('src', bindingsUrl);
        bindings.addEventListener('load', () => {;
            console.log(window);
            Object.assign(module.exports, window.em_crypto);
            console.log('bindings script loaded', module.exports);
            resolve();
        });
        document.body.append(bindings);
        module.exports = {};
    });
    }
    
    function loadWasmApi() {
        return new Promise((resolve, reject)=>{
        const wasmApiUrl = (process.env.REACT_APP_CONTEXT_PATH || '') + '/lib/emscripten/wasmapi.js';
        const wasmApi = document.createElement('script');
        wasmApi.setAttribute('id', 'wasmapi');
        wasmApi.setAttribute('type', 'text/javascript');
        wasmApi.setAttribute('src', wasmApiUrl);
        wasmApi.addEventListener('load', () => {;
            console.log(window);
            Object.assign(module.exports,{ServiceFactory:window.serviceFactory});
            console.log('wasmapi script loaded', module.exports);
            resolve();
        });
        document.body.append(wasmApi);
        module.exports = {};
        });
    }
    
loadWasmApi().then(()=>{
    loadBindings().then(()=>console.log("module", module.exports));
    LoadEmscripten().then(()=>console.log("module", module.exports));
});

