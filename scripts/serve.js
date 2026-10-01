#!/usr/bin/env node
// Minimal static file server for ./dist (for local testing; in production any static web server works)
//
// usage: node scripts/serve.js [port]

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.dat': 'application/octet-stream',
    '.png': 'image/png',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ is missing, please run "npm run build" first');
    process.exit(1);
}

http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
        res.writeHead(400).end();
        return;
    }
    let file = path.join(DIST, pathname);
    if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`Elm REPL running at http://localhost:${PORT}`);
});
