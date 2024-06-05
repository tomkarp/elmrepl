const express = require('express')
const app = express()
const pty = require('node-pty');
const expressWs = require('express-ws')(app);
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

let DEBUG = true;
const port = 3000

app.set('trust proxy', 'uniquelocal')

app.use(express.static(__dirname + '/web'));
app.use('/static/xterm', express.static(__dirname + '/../node_modules/xterm/lib'));
app.use('/static/xterm/css', express.static(__dirname + '/../node_modules/xterm/css'));
app.use('/static/xterm-addon-fit', express.static(__dirname + '/../node_modules/xterm-addon-fit/lib'));
app.use('/static/xterm-addon-attach', express.static(__dirname + '/../node_modules/xterm-addon-attach/lib'));
app.use('/static/monaco-editor', express.static(__dirname+'/../node_modules/monaco-editor'))
app.use('/static/jquery-resizable-dom', express.static(__dirname+'/../node_modules/jquery-resizable-dom/dist'))
app.use('/static/jquery-resizable-dom/assets', express.static(__dirname+'/../node_modules/jquery-resizable-dom/assets'))
app.use('/static/jquery', express.static(__dirname+'/../node_modules/jquery/dist'))

app.disable('x-powered-by')

let terminals = {}; 
let logs = {};

app.post('/terminals', (req, res) => {
    repl_name = uuidv4();
    cols = parseInt(req.query.cols),
    rows = parseInt(req.query.rows);
    
    fs.writeFileSync('/tmp/'+repl_name, 'module Main exposing (..)\n\nmessage = "Hello World"');

    term = pty.spawn('docker', ["run", "-it", "--rm", "-m", "300m", "--cpus", "0.25", "-v", "/tmp/"+repl_name+":/src/Main.elm", "--name", repl_name, "elm-repl"], {
        name: 'xterm-color',
            cols: cols,
            rows: rows
    });
    
    if (DEBUG) console.log(`Created terminal with PID: ${term.pid}, container: ${repl_name}, size: ${cols}x${rows}`);
    
    terminals[repl_name] = term;
    
    term.on('data', (data) => {
        logs[repl_name] += data;
    });
    
    res.send(repl_name);
    res.end();
    logs[repl_name] = ""
})


app.post('/terminals/:repl_name/size', (req, res) => {
    if (!terminals[req.params.repl_name]) {
        res.end();
        if (DEBUG) console.log('resizing: terminal not existing ' + req.params.repl_name);
        return;
    }
    let term = terminals[req.params.repl_name],
        cols = parseInt(req.query.cols),
        rows = parseInt(req.query.rows);

    term.resize(cols, rows);
    res.end();
    if (DEBUG) console.log('Resized terminal ' + req.params.repl_name + ' to ' + cols + ' cols and ' + rows + ' rows.');
});

app.post('/save/:repl_name', (req,res) => {
    if (!terminals[req.params.repl_name]) {
        res.end();
        if (DEBUG) console.log('saving: terminal not existing ' + req.params.repl_name);
        return;
    }
    fs.writeFileSync('/tmp/'+req.params.repl_name, req.query.data);
    res.end();
    if (DEBUG) console.log("Saved file"+req.params.repl_name);
})


app.listen(port, () => {
  console.log(`app listening on port ${port}`)
})

app.ws('/ws/:repl_name', (ws, req) => {
    let repl_name = req.params.repl_name,
        term = terminals[repl_name];
    if (DEBUG) console.log('Connected to terminal ' + repl_name);

    try {
        ws.send(logs[repl_name]);
    } catch (e) {
        console.error(e)
        ws.close();
    }

    term.on('data', (data) => {
        try {
            ws.send(data);
        } catch (e) {
            console.error(e)
        }
    });

    term.on('exit', (code, signal) => {
        try {
            ws.close();
        } catch (e) {
            console.error(e)
        }
    });

    ws.on('message', (msg) => {
        try {
            term.write(msg);
        } catch (e) {
            console.error(e)
            ws.close();
        }
    });

    ws.on('close', () => {
        try {
            let stop_container = pty.spawn('docker', ["rm", "-f", repl_name]);
            stop_container.on('close', code => {
                if (DEBUG) console.log("Stopped container "+repl_name);
            });
            delete terminals[repl_name];
            delete logs[repl_name];
            fs.unlinkSync('/tmp/'+repl_name);
        } catch (e) {
            console.error(e)
        }
    });
});


