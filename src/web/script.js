// EDITOR
// compress and return compressed string as base64
function compress(string, encoding) {
    const byteArray = new TextEncoder().encode(string);
    const cs = new CompressionStream(encoding);
    const writer = cs.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    return new Response(cs.readable).arrayBuffer().then(function (arrayBuffer) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)));
    });
}

// take compressed base64 string as string and return decompressed string
function decompress(string, encoding) {
    try {
        atob(string);
    } catch (e) {
        alert('Compressed data is not valid');
        return;
    }
    const byteArray = Uint8Array.from(atob(string), c => c.charCodeAt(0));
    const ds = new DecompressionStream(encoding);
    const writer = ds.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    return new Response(ds.readable).text();
}

// save code to file
function downloadCode() {
    var text = window.theEditor.getValue();
    var filename = "Main.elm";
    var blob = new Blob([text], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

// open code from file
function uploadCode() {
    var input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        var file = e.target.files[0];
        var reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = readerEvent => {
            window.theEditor.setValue(readerEvent.target.result);
        }
    }
    input.click();
}

// create url with compressed code and copy to clipboard
function shareCode() {
    compress(window.theEditor.getValue(), 'gzip').then(function (compressed) {
        var url = window.location.href.split('?')[0] + '?compressed=' + encodeURIComponent(compressed);
        navigator.clipboard.writeText(url).then(function () {
            alert('Link copied to clipboard');
        }, function (err) {
            console.error('Could not copy text: ', err);
        });
    });
}

// drag and drop file to editor
window.addEventListener('dragover', function (e) {
    e.preventDefault();
}, false);
window.addEventListener('drop', function (e) {
    e.preventDefault();
    var reader = new FileReader();
    reader.readAsText(e.dataTransfer.files[0], 'UTF-8');
    reader.onload = readerEvent => {
        window.theEditor.setValue(readerEvent.target.result);
    }
}, false);

$(".panel-top").resizable({
    handleSelector: ".splitter-horizontal",
    resizeWidth: false,
});
$(".panel-bottom").resizable({
    handleSelector: ".splitter-horizontal",
    resizeWidth: false,
});



// write the editor content to src/Main.elm of the REPL (also happens before every REPL input)
function save() {
    if (window.replTerminal) window.replTerminal.syncCode();
}

// elm-format runs in its own web worker (see repl-worker/format-worker.js)
let formatWorker = null;
let formatRequestId = 0;
const formatRequests = {};

function getFormatWorker() {
    if (!formatWorker) {
        formatWorker = replAssets.then(function (assets) {
            const worker = new Worker(assets.formatWorker);
            worker.onmessage = function (event) {
                const resolve = formatRequests[event.data.id];
                delete formatRequests[event.data.id];
                if (resolve) resolve(event.data);
            };
            return worker;
        });
    }
    return formatWorker;
}

function format(source) {
    return getFormatWorker().then(function (worker) {
        return new Promise(function (resolve) {
            const id = ++formatRequestId;
            formatRequests[id] = resolve;
            worker.postMessage({ id: id, source: source });
            setTimeout(function () {
                if (formatRequests[id]) {
                    delete formatRequests[id];
                    resolve({ error: 'timeout' });
                }
            }, 20000);
        });
    });
}

async function formatCode() {
    if (!window.theEditor) {
        return;
    }

    const formatBtn = document.querySelector('.format-btn');
    const originalContent = formatBtn.innerHTML;
    formatBtn.innerHTML = '<span style="opacity: 0.7;">Formatting...</span>';
    formatBtn.style.opacity = '0.6';

    try {
        const source = window.theEditor.getValue();
        const result = await format(source);
        if (result.error !== undefined) {
            alert('Formatting failed: ' + result.error);
        } else if (result.formatted !== source) {
            // keep undo history
            const model = window.theEditor.getModel();
            window.theEditor.pushUndoStop();
            window.theEditor.executeEdits('elm-format', [{ range: model.getFullModelRange(), text: result.formatted }]);
            window.theEditor.pushUndoStop();
        }
    } catch (e) {
        alert('Formatting failed: ' + e);
    } finally {
        formatBtn.innerHTML = originalContent;
        formatBtn.style.opacity = '1';
    }
}

function applyEditorDarkMode(enabled) {
    localStorage.setItem("darkmode-editor", enabled);
    const checkbox = document.getElementById('darkmode-editor');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    if (window.theEditor) {
        window.theEditor.updateOptions({ theme: enabled ? "dark" : "light" });
    }
}

function toggleEditorDarkMode() {
    const checkbox = document.getElementById('darkmode-editor');
    const current = checkbox ? checkbox.checked : localStorage.getItem("darkmode-editor") === 'true';
    applyEditorDarkMode(!current);
}

function applyTerminalDarkMode(enabled) {
    localStorage.setItem("darkmode-terminal", enabled);
    const checkbox = document.getElementById('darkmode-terminal');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    if (term) {
        term.options.theme = enabled ? {} : terminaLightTheme;
        if (window.fit) {
            setTimeout(() => window.fit.fit(), 50);
        }
    }
}

function toggleTerminalDarkMode() {
    const checkbox = document.getElementById('darkmode-terminal');
    const current = checkbox ? checkbox.checked : localStorage.getItem("darkmode-terminal") === 'true';
    applyTerminalDarkMode(!current);
}

// Keyboard shortcut for formatting (Cmd+Shift+F on Mac, Ctrl+Shift+F on others)
window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        formatCode();
        return;
    }
    // Alt differentiates terminal toggle so editor doesn't double-toggle.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleTerminalDarkMode();
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleEditorDarkMode();
        return;
    }
    // Keyboard shortcut for toggling Vim mode (Cmd+Shift+V on Mac, Ctrl+Shift+V on others)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') {
        e.preventDefault();
        const vimCheckbox = document.getElementById('vim-mode');
        vimCheckbox.checked = !vimCheckbox.checked;
        if (vimCheckbox.checked) {
            activateVimMode();
        } else {
            deactivateVimMode();
        }
    }
});

// warn before reload/closing
window.onbeforeunload = function () {
    return 'saved your changes?';
};

// get url parameter ?code=... and set it as the editor content
// get url parameter ?compressed=... and set it as the editor content
// resolves when the editor shows the final content (decompressing is asynchronous)
let resolveEditorReady;
const editorReady = new Promise(function (resolve) { resolveEditorReady = resolve; });

function getEditorValue() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const compressed = urlParams.get('compressed');

    if (code) {
        value = 'module Main exposing (..)\n\n' + code;
        setTimeout(resolveEditorReady, 0);
    } else if (compressed) {
        const decompressing = decompress(compressed, 'gzip');
        if (decompressing) {
            decompressing.then(function (decompressed) {
                window.theEditor.setValue(decompressed);
            }).catch(function () {
                alert('Compressed data is not valid');
            }).finally(resolveEditorReady);
        } else {
            setTimeout(resolveEditorReady, 0);
        }
        value = "decompressing ..."
    } else {
        value = 'module Main exposing (..)\n\nmessage = "Hello World"'
        setTimeout(resolveEditorReady, 0);
    }
    return value;
}

require.config({ paths: { 'vs': 'static/monaco-editor/min/vs', 'monaco-vim': 'static/monaco-vim/dist/monaco-vim' } });

require(['vs/editor/editor.main'], function () {
    // Monaco is already globally available as window.monaco after loading
    
    monaco.languages.register({ id: 'Elm' });

    monaco.languages.setMonarchTokensProvider('Elm', window.elm_monarch);

    // monaco-editor theme & colors
    monaco.editor.defineTheme('dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '#C586C0' },
            { token: 'type', foreground: '#569CD6' },
            { token: 'function.name', foreground: '#DCDCAA' },
        ],
        colors: {},
    });

    monaco.editor.defineTheme('light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '#037ABA' },
            { token: 'type', foreground: '#BE5A09' },
            { token: 'function.name', foreground: '#044B86' },
        ],
        colors: {},
    });

    // init editor
    var editor = monaco.editor.create(document.getElementById('container'), {
        fontSize: 18,
        value: getEditorValue(),
        language: 'Elm',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        theme: localStorage.getItem("darkmode-editor") === 'true' ? "dark" : "light",
        automaticLayout: true,
    });

    // save with ctrl + s in editor window
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, save);

    window.theEditor = editor;

    // Setup Vim mode toggle after editor is ready
    setupVimModeToggle();

    // Initialize Vim mode if enabled in localStorage
    if (localStorage.getItem("vim-mode") === 'true') {
        require(['monaco-vim'], function (MonacoVim) {
            try {
                const statusBar = document.createElement('div');
                statusBar.id = 'vim-status';
                statusBar.style.cssText = 'position: fixed; bottom: 30px; left: 0; right: 0; padding: 5px 10px; background: #007acc; color: white; font-family: monospace; font-size: 12px; z-index: 1000;';
                document.body.appendChild(statusBar);
                
                // Adjust panel-bottom to make room for Vim status bar
                document.querySelector('.panel-bottom').style.marginBottom = '32px';
                
                // Trigger terminal resize to update layout
                if (window.fit) {
                    setTimeout(() => window.fit.fit(), 100);
                }
                
                window.vimMode = MonacoVim.initVimMode(editor, statusBar);
                window.MonacoVim = MonacoVim;
                console.log('Vim mode initialized on startup');
            } catch (e) {
                console.error('Failed to initialize vim mode:', e);
            }
        });
    } else {
        // Preload the Vim mode library, so that it can be enabled later without network access
        require(['monaco-vim'], function () {}, function (err) {
            console.error('Failed to preload monaco-vim:', err);
        });
    }
});

// Setup Vim mode toggle function
function setupVimModeToggle() {
    if (localStorage.getItem("vim-mode") === null) {
        localStorage.setItem("vim-mode", false);
    }
    document.querySelector('#vim-mode').checked = (localStorage.getItem('vim-mode') === 'true')
    document.getElementById("vim-mode").addEventListener("change", function () {
        if (this.checked) {
            activateVimMode();
        } else {
            deactivateVimMode();
        }
    });
}

function activateVimMode() {
    require(['monaco-vim'], function (MonacoVim) {
        try {
            if (!document.getElementById('vim-status')) {
                const statusBar = document.createElement('div');
                statusBar.id = 'vim-status';
                statusBar.style.cssText = 'position: fixed; bottom: 30px; left: 0; right: 0; padding: 5px 10px; background: #007acc; color: white; font-family: monospace; font-size: 12px; z-index: 1000;';
                document.body.appendChild(statusBar);
            }
            // Adjust panel-bottom to make room for Vim status bar
            document.querySelector('.panel-bottom').style.marginBottom = '32px';
            
            // Trigger terminal resize to update layout
            if (window.fit) {
                setTimeout(() => window.fit.fit(), 100);
            }
            
            window.vimMode = MonacoVim.initVimMode(window.theEditor, document.getElementById('vim-status'));
            window.MonacoVim = MonacoVim;
            localStorage.setItem("vim-mode", true);
            console.log('Vim mode enabled successfully', MonacoVim);
        } catch (e) {
            console.error('Failed to enable vim mode:', e);
            alert('Vim mode activation failed: ' + e.message);
            document.getElementById("vim-mode").checked = false;
        }
    }, function(err) {
        console.error('Failed to load monaco-vim:', err);
        alert('Failed to load Vim mode library');
        document.getElementById("vim-mode").checked = false;
    });
}

function deactivateVimMode() {
    try {
        if (window.vimMode) {
            window.vimMode.dispose();
        }
        const statusBar = document.getElementById('vim-status');
        if (statusBar) statusBar.remove();
        
        // Reset panel-bottom margin
        document.querySelector('.panel-bottom').style.marginBottom = '0';
        
        // Trigger terminal resize to update layout
        if (window.fit) {
            setTimeout(() => window.fit.fit(), 100);
        }
        
        localStorage.setItem("vim-mode", false);
        console.log('Vim mode disabled');
    } catch (e) {
        console.error('Failed to disable vim mode:', e);
    }
}

// TERMINAL

terminaLightTheme = {
    "foreground": "#383A42",
    "background": "#FAFAFA",
    "cursorColor": "#4F525D",
    "selectionBackground": "#FFFFFF",
    "black": "#383A42",
    "red": "#E45649",
    "green": "#50A14F",
    "yellow": "#C18301",
    "blue": "#0184BC",
    "purple": "#A626A4",
    "cyan": "#0997B3",
    "white": "#FAFAFA",
    "brightBlack": "#4F525D",
    "brightRed": "#DF6C75",
    "brightGreen": "#98C379",
    "brightYellow": "#E4C07A",
    "brightBlue": "#61AFEF",
    "brightPurple": "#C577DD",
    "brightCyan": "#56B5C1",
    "brightWhite": "#FFFFFF",
    "cursor": "#4F525D"
}

let term;
const fit = new FitAddon.FitAddon();
const terminalContainer = document.getElementById('terminal-container');

// Make fit available globally for Vim mode
window.fit = fit;

const createTerminal = () => {
    term = new Terminal({
        fontSize: 18,
        fontFamily: "Menlo, Monaco, monospace",
        cursorBlink: false,
        convertEol: true,
    });
    term.options.theme = localStorage.getItem("darkmode-terminal") === 'true' ? {} : terminaLightTheme;

    term.open(terminalContainer);

    //  ctrl + c for copy when selecting data in terminal, default otherwise. ctrl + v for paste
    term.attachCustomKeyEventHandler((arg) => {
        if (arg.ctrlKey && arg.code === "KeyC" && arg.type === "keydown") {
            const selection = term.getSelection();
            if (selection) {
                document.execCommand('copy')
                term.clearSelection();
                return false;
            }
        }
        if (arg.ctrlKey && arg.code === "KeyV" && arg.type === "keydown") {
            arg.preventDefault();
            arg.stopPropagation();
            navigator.clipboard.readText()
                .then(text => window.replTerminal.type(text))
                .catch(() => {});
            return false;
        };
        return true;
    });

    // dynamic resize of terminal
    term.loadAddon(fit);
    fit.fit();

    window.replTerminal = new ReplTerminal(
        term,
        () => window.theEditor ? window.theEditor.getValue() : '',
        notify
    );
}

if (localStorage.getItem("darkmode-terminal") === null) {
    localStorage.setItem("darkmode-terminal", true);
}

createTerminal();

new ResizeObserver(function () { fit.fit(); }).observe(document.getElementsByClassName("panel-top")[0])

// the REPL was stopped (:exit) or failed
function notify() {
    terminalContainer.style.opacity = 0.5;
    document.getElementById('connection-error').style.display = 'block';
}

// start a fresh REPL with the current editor code
function reconnect() {
    document.getElementById('connection-error').style.display = 'none';
    terminalContainer.style.opacity = 1;
    term.focus();
    window.replTerminal.restart("import Main exposing (..)\n");
}

// start the REPL; if parameter ?repl=... is set, type it after importing Main
const urlParams = new URLSearchParams(window.location.search);
const repl = urlParams.get('repl');
editorReady.then(() => {
    window.replTerminal.start("import Main exposing (..)\n" + (repl ? repl + "\n" : ""));
    term.focus();
});


var settingsModal = document.getElementById("settingsModal");

// When the user clicks on the settings button, open the modal
document.getElementById("settings").onclick = function () {
    settingsModal.style.display = "block";
}

// When the user clicks on the close button, close the modal
document.getElementById("close").onclick = function () {
    settingsModal.style.display = "none";
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    if (event.target == settingsModal) {
        settingsModal.style.display = "none";
    }
}

if (localStorage.getItem("darkmode-editor") === null) {
    localStorage.setItem("darkmode-editor", true);
}
document.querySelector('#darkmode-editor').checked = (localStorage.getItem('darkmode-editor') === 'true')
document.getElementById("darkmode-editor").addEventListener("change", function () {
    applyEditorDarkMode(this.checked);
});

document.querySelector('#darkmode-terminal').checked = (localStorage.getItem('darkmode-terminal') === 'true')
document.getElementById("darkmode-terminal").addEventListener("change", function () {
    applyTerminalDarkMode(this.checked);
});
