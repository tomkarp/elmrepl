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



// save code to server
function save() {
    fetch('/save/' + window.repl_name + '?data=' + encodeURIComponent(window.theEditor.getValue()), { method: 'POST' });
}

// warn before reload/closing
window.onbeforeunload = function () {
    return 'saved your changes?';
};

// get url parameter ?code=... and set it as the editor content
// get url parameter ?compressed=... and set it as the editor content
function getEditorValue() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const compressed = urlParams.get('compressed');

    if (code) {
        fetch('/save/' + window.repl_name + '?data=' + encodeURIComponent('module Main exposing (..)\n\n' + code), { method: 'POST' });
        value = 'module Main exposing (..)\n\n' + code;
    } else if (compressed) {
        decompress(compressed, 'gzip').then(function (decompressed) {
            window.theEditor.setValue(decompressed);
        });
        value = "decompressing ..."
    } else {
        value = 'module Main exposing (..)\n\nmessage = "Hello World"'
    }
    return value;
}

require.config({ paths: { 'vs': '/static/monaco-editor/min/vs' } });

require(['vs/editor/editor.main'], function () {
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
        theme: localStorage.getItem("darkmode-editor") === 'false' ? "light" : "dark",
        automaticLayout: true,
    });

    // auto-save on change
    monaco?.editor?.getModels()[0].onDidChangeContent(save);
    // save with ctrl + s in editor window
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, save);

    window.theEditor = editor;
});

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

let term,
    socketURL,
    socket;
const fit = new FitAddon.FitAddon();
const terminalContainer = document.getElementById('terminal-container');

const createTerminal = () => {
    term = new Terminal({
        fontSize: 18,
        fontFamily: "Menlo, Monaco, monospace",
        cursorBlink: false
    });
    term.options.theme = localStorage.getItem("darkmode-terminal") === 'false' ? terminaLightTheme : {};
    socketURL = ((location.protocol === 'https:') ? 'wss://' : 'ws://') + location.hostname + ((location.port) ? (':' + location.port) : '') + '/ws/';

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
            navigator.clipboard.readText()
                .then(text => {
                    socket.send(text)
                })
        };
        return true;
    });

    // dynamic resize of terminal
    term.loadAddon(fit);
    fit.fit();
    term.onResize(function (size) {
        if (!window.repl_name) {
            return;
        }
        fetch('/terminals/' + window.repl_name + '/size?cols=' + size.cols + '&rows=' + size.rows, { method: 'POST' });
    });

    // resize terminal on server
    fetch('/terminals?cols=' + term.cols + '&rows=' + term.rows, { method: 'POST' }).then((res) => {
        if (!res.ok) {
            notify();
            return;
        }

        res.text().then((repl_name) => {
            window.repl_name = repl_name;
            socketURL += repl_name;
            socket = new WebSocket(socketURL);
            socket.onopen = runRealTerminal;
            socket.onclose = notify;
            socket.onerror = notify;
        });
    }).catch((e) => {
        document.getElementById("overlay").innerText = e;
        notify();
    });;
}

createTerminal();

new ResizeObserver(function () { fit.fit(); }).observe(document.getElementsByClassName("panel-top")[0])

const notify = () => {
    terminalContainer.style.opacity = 0.5;
    term.write("\r\nConnection lost.\r\n")
}

// connect terminal to websocket
const runRealTerminal = () => {
    term.loadAddon(new AttachAddon.AttachAddon(socket));
    term._initialized = true;
}

// if parameter ?repl=... is set send to websocket
const urlParams = new URLSearchParams(window.location.search);
const repl = urlParams.get('repl');
if (repl) {
    setTimeout(() => {
        socket.send("import Main exposing (..)\n" + repl + "\n")
    }, 2000);
} else {
    setTimeout(() => {
        socket.send("import Main exposing (..)\n")
    }, 2000);
}


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

document.querySelector('#darkmode-editor').checked = (localStorage.getItem('darkmode-editor') === 'true')
document.getElementById("darkmode-editor").addEventListener("change", function () {
    if (this.checked) {
        window.theEditor.updateOptions({ theme: "dark" });
        localStorage.setItem("darkmode-editor", true);
    } else {
        window.theEditor.updateOptions({ theme: "light" });
        localStorage.setItem("darkmode-editor", false);
    }
});

document.querySelector('#darkmode-terminal').checked = (localStorage.getItem('darkmode-terminal') === 'true')
document.getElementById("darkmode-terminal").addEventListener("change", function () {
    if (this.checked) {
        term.options.theme = {};
        localStorage.setItem("darkmode-terminal", true);
    } else {
        term.options.theme = terminaLightTheme;
        localStorage.setItem("darkmode-terminal", false);
    }
});