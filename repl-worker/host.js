// Web Worker glue for the Elm REPL.
//
// The build script appends this file to the compiled Elm REPL worker
// (repl-worker/Worker.elm), so `Elm.Repl.Worker` is available here.
//
// Messages from the page:
//   { type: 'init', elmHome, project }             mount ELM_HOME and the project (base64), start the REPL
//   { type: 'write', path, content }               write a file into the virtual file system
//   { type: 'input', line }                         one line of user input
//   { type: 'cancel' }                              discard an incomplete multi-line input
//
// Messages to the page:
//   { type: 'response', running, prefill, messages, logs }

(function () {
    'use strict';

    let elm = null;
    let logs = [];

    // Debug.log uses console.log; collect its output so it can be shown in the terminal
    console.log = function () {
        logs.push(Array.prototype.map.call(arguments, String).join(' '));
    };

    // The file systems are mounted from URLs. Data URLs also work when the page is opened
    // from the file system (Safari does not allow requests to blob URLs there).
    function dataUrl(base64) {
        return 'data:application/octet-stream;base64,' + base64;
    }

    function init(elmHome, project) {
        elm = Elm.Repl.Worker.init({
            flags: [
                ['mountStatic', dataUrl(project), '/'],
                ['mountStatic', dataUrl(elmHome), '/.elm'],
                // starts the REPL after the file systems are mounted and responds with the welcome message
                ['start', '', ''],
            ],
        });

        elm.ports.sendToClientPort.subscribe(function (response) {
            postMessage({
                type: 'response',
                running: response[0],
                prefill: response[1],
                messages: response[2],
                logs: logs,
            });
            logs = [];
        });

        elm.ports.sendToJavaScriptPort.subscribe(function (code) {
            try {
                // indirect eval: evaluate in the global scope of the worker
                const result = (0, eval)(code + '\n_result;');
                elm.ports.receiveFromJavaScriptPort.send([true, result]);
            } catch (error) {
                // same format as `elm repl` (node prints e.g. "RangeError: Maximum call stack size exceeded")
                elm.ports.receiveFromJavaScriptPort.send([false, String(error)]);
            }
        });
    }

    self.onmessage = function (event) {
        const msg = event.data;
        switch (msg.type) {
            case 'init':
                init(msg.elmHome, msg.project);
                break;
            case 'write':
                elm.ports.writeFilePort.send([msg.path, msg.content]);
                break;
            case 'input':
                elm.ports.receiveFromClientPort.send(msg.line);
                break;
            case 'cancel':
                elm.ports.cancelInputPort.send(null);
                break;
        }
    };
})();
