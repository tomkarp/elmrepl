#!/usr/bin/env node
// Builds the static online Elm REPL into ./dist
//
// 1. the Elm REPL web worker (Elm compiler ported to Elm, https://github.com/pithub/elm-repl-worker)
// 2. the preinstalled Elm packages (ELM_HOME) and the precompiled project as virtual file systems
// 3. the elm-format web worker (from Guida, https://github.com/guida-lang/compiler)
// 4. the web page and its third party libraries
//
// Elm packages and the compiler port are fetched from GitHub with git, so the build does not
// depend on package.elm-lang.org. Everything is cached in ./build.
//
// usage: node scripts/build.js [--clean]

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// pinned version of https://github.com/pithub/elm-repl-worker (contains the compiler port as subtree)
const REPL_WORKER_REPO = 'https://github.com/pithub/elm-repl-worker.git';
const REPL_WORKER_COMMIT = 'ffbc395bd057ba42dd12583f0cdd2a3ffd8f4b3a';

// packages available in the REPL (same as the former docker image: elm init + elm/random, elm/json, elm/svg)
const PROJECT_ELM_JSON = {
    'type': 'application',
    'source-directories': ['src'],
    'elm-version': '0.19.1',
    'dependencies': {
        'direct': {
            'elm/browser': '1.0.2',
            'elm/core': '1.0.5',
            'elm/html': '1.0.0',
            'elm/json': '1.1.3',
            'elm/random': '1.0.0',
            'elm/svg': '1.0.1',
        },
        'indirect': {
            'elm/time': '1.0.0',
            'elm/url': '1.0.0',
            'elm/virtual-dom': '1.0.3',
        },
    },
    'test-dependencies': {
        'direct': {},
        'indirect': {},
    },
};

const DEFAULT_MAIN = 'module Main exposing (..)\n\nmessage = "Hello World"\n';

// The virtual file system stores modification times in milliseconds. Elm compares the
// modification time of elm.json with the one stored in elm-stuff, so all inputs get a
// fixed time in whole seconds before compiling.
const FIXED_MTIME = 1700000000;

const ELM_HOME = path.join(BUILD, 'elm-home');
const PACKAGES = path.join(ELM_HOME, '0.19.1', 'packages');

function log(message) {
    console.log('[build] ' + message);
}

function run(command, args, options = {}) {
    execFileSync(command, args, { stdio: 'inherit', ...options });
}

function elm(args, cwd) {
    const isWindows = process.platform === 'win32';
    const bin = path.join(NODE_MODULES, '.bin', isWindows ? 'elm.cmd' : 'elm');
    if (!fs.existsSync(bin)) {
        throw new Error('elm not found, please run "npm install" first');
    }
    run(bin, args, { cwd, shell: isWindows, env: { ...process.env, ELM_HOME } });
}

function rmrf(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function copyDir(from, to) {
    fs.cpSync(from, to, { recursive: true });
}

function walk(dir, callback) {
    callback(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(p, callback);
        } else {
            callback(p);
        }
    }
}

function setFixedMtime(dir) {
    walk(dir, (p) => fs.utimesSync(p, FIXED_MTIME, FIXED_MTIME));
}


// COMPILER PORT

function fetchReplWorker() {
    const dir = path.join(BUILD, 'cache', 'elm-repl-worker-' + REPL_WORKER_COMMIT);
    if (!fs.existsSync(path.join(dir, 'elm.json'))) {
        log('fetching elm-repl-worker ' + REPL_WORKER_COMMIT);
        rmrf(dir);
        fs.mkdirSync(dir, { recursive: true });
        run('git', ['init', '-q'], { cwd: dir });
        run('git', ['fetch', '-q', '--depth', '1', REPL_WORKER_REPO, REPL_WORKER_COMMIT], { cwd: dir });
        run('git', ['checkout', '-q', 'FETCH_HEAD'], { cwd: dir });
    }
    return dir;
}


// PACKAGES

function dependenciesOf(elmJson) {
    return { ...elmJson.dependencies.direct, ...elmJson.dependencies.indirect };
}

function fetchPackage(name, version) {
    const dir = path.join(PACKAGES, name, version);
    if (fs.existsSync(path.join(dir, 'elm.json'))) {
        return;
    }
    log('fetching package ' + name + ' ' + version);
    rmrf(dir);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    run('git', ['-c', 'advice.detachedHead=false', 'clone', '-q', '--depth', '1', '--branch', version,
        'https://github.com/' + name + '.git', dir]);
    rmrf(path.join(dir, '.git'));
}

// Writes a registry.dat (binary format of the Elm compiler, see builder/src/Deps/Registry.hs)
// that only knows the given packages, so `elm` does not need to download the package list.
function writeRegistry(packages) {
    // sorted like the Haskell Map: by author, then by project (bytewise)
    const compareBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    const names = Object.keys(packages).sort((a, b) => {
        const [authorA, projectA] = a.split('/');
        const [authorB, projectB] = b.split('/');
        return compareBytes(authorA, authorB) || compareBytes(projectA, projectB);
    });
    const chunks = [];
    const int = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); chunks.push(b); };
    const str = (s) => { const b = Buffer.from(s, 'utf8'); chunks.push(Buffer.from([b.length]), b); };
    const version = (v) => {
        const parts = v.split('.').map(Number);
        if (parts.every((p) => p < 255)) {
            chunks.push(Buffer.from(parts));
        } else {
            const b = Buffer.alloc(7);
            b[0] = 255;
            parts.forEach((p, i) => b.writeUInt16BE(p, 1 + 2 * i));
            chunks.push(b);
        }
    };
    const count = names.reduce((sum, name) => sum + packages[name].length, 0);
    int(count);
    int(names.length);
    for (const name of names) {
        const [author, project] = name.split('/');
        const versions = packages[name].slice().sort(compareVersions).reverse();
        str(author);
        str(project);
        version(versions[0]);
        int(versions.length - 1);
        versions.slice(1).forEach(version);
    }
    writeFile(path.join(PACKAGES, 'registry.dat'), Buffer.concat(chunks));
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

function preparePackages(workerElmJson) {
    const packages = {};
    for (const deps of [dependenciesOf(workerElmJson), dependenciesOf(PROJECT_ELM_JSON)]) {
        for (const [name, version] of Object.entries(deps)) {
            packages[name] = packages[name] || [];
            if (!packages[name].includes(version)) {
                packages[name].push(version);
            }
        }
    }
    for (const [name, versions] of Object.entries(packages)) {
        versions.forEach((version) => fetchPackage(name, version));
    }
    writeRegistry(packages);
}


// STATIC FILE SYSTEM

// Packs a directory tree into the format read by `mountStatic` of the compiler port
// (see compiler/scripts/static-dir.js): 4 bytes length of a JSON tree, the JSON tree
// [entries, mtime] with entries name -> [size, mtime] or [entries, mtime], followed by
// the contents of all files. The compiler port reads the contents in sorted name order.
function packTree(tree) {
    const contents = [];
    const toJson = (node) => {
        const entries = {};
        for (const name of Object.keys(node.entries).sort()) {
            const child = node.entries[name];
            if (child.entries) {
                entries[name] = toJson(child);
            } else {
                entries[name] = [child.content.length, child.mtime];
                contents.push(child.content);
            }
        }
        return [entries, node.mtime];
    };
    const json = Buffer.from(JSON.stringify(toJson(tree)), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(json.length);
    return Buffer.concat([length, json, ...contents]);
}

function readTree(dir, filter = () => true) {
    const mtime = (p) => Math.trunc(fs.statSync(p).mtimeMs);
    const entries = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (!filter(p, entry)) continue;
        entries[entry.name] = entry.isDirectory()
            ? readTree(p, filter)
            : { content: fs.readFileSync(p), mtime: mtime(p) };
    }
    return { entries, mtime: mtime(dir) };
}

function dirNode(entries) {
    return { entries, mtime: FIXED_MTIME * 1000 };
}

// ELM_HOME with the compiled packages of the project (elm.json and artifacts.dat only)
function packElmHome() {
    const authors = {};
    for (const [name, version] of Object.entries(dependenciesOf(PROJECT_ELM_JSON))) {
        const [author, project] = name.split('/');
        const dir = path.join(PACKAGES, name, version);
        const file = (f) => ({ content: fs.readFileSync(path.join(dir, f)), mtime: FIXED_MTIME * 1000 });
        authors[author] = authors[author] || dirNode({});
        authors[author].entries[project] = dirNode({
            [version]: dirNode({
                'elm.json': file('elm.json'),
                'artifacts.dat': file('artifacts.dat'),
                'src': dirNode({}),
            }),
        });
    }
    return packTree(dirNode({ '0.19.1': dirNode({ 'packages': dirNode(authors) }) }));
}


// BUILD STEPS

async function buildReplWorker(replWorkerDir) {
    log('compiling the Elm REPL worker');
    const src = path.join(BUILD, 'repl-worker-src');
    rmrf(src);
    copyDir(replWorkerDir, src);
    rmrf(path.join(src, '.git'));
    fs.copyFileSync(path.join(ROOT, 'repl-worker', 'Worker.elm'), path.join(src, 'src', 'Repl', 'Worker.elm'));

    // print colored output like `elm repl` in a terminal (this also makes the output of values identical)
    const replElm = path.join(src, 'compiler', 'src', 'Terminal', 'Repl.elm');
    const original = fs.readFileSync(replElm, 'utf8');
    const patched = original.replace('IO.return <| Env root interpreter False', 'IO.return <| Env root interpreter True');
    if (patched === original) {
        throw new Error('could not enable ANSI colors in ' + replElm);
    }
    fs.writeFileSync(replElm, patched);

    const output = path.join(BUILD, 'elm-repl-worker.js');
    elm(['make', 'src/Repl/Worker.elm', '--output', output], src);

    const code = fs.readFileSync(output, 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'repl-worker', 'host.js'), 'utf8');
    const result = await esbuild.transform(code, { minify: true, legalComments: 'none' });
    writeFile(path.join(DIST, 'repl', 'repl-worker.js'), result.code);
}

function buildFileSystems() {
    log('precompiling the REPL project');
    const project = path.join(BUILD, 'project');
    rmrf(project);
    writeFile(path.join(project, 'elm.json'), JSON.stringify(PROJECT_ELM_JSON, null, 4) + '\n');
    writeFile(path.join(project, 'src', 'Main.elm'), DEFAULT_MAIN);

    setFixedMtime(project);
    for (const name of Object.keys(dependenciesOf(PROJECT_ELM_JSON))) {
        setFixedMtime(path.join(PACKAGES, name));
    }
    elm(['make', 'src/Main.elm', '--output', '/dev/null'], project);

    writeFile(path.join(DIST, 'repl', 'elm-home.dat'), packElmHome());
    writeFile(path.join(DIST, 'repl', 'project.dat'), packTree(readTree(project, (p) => path.basename(p) !== 'lock')));
}

async function buildFormatWorker() {
    log('bundling the elm-format worker');
    await esbuild.build({
        entryPoints: [path.join(ROOT, 'repl-worker', 'format-worker.js')],
        outfile: path.join(DIST, 'repl', 'format-worker.js'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        minify: true,
        legalComments: 'none',
        logLevel: 'warning',
    });
}

// The page loads the REPL files with a script tag instead of fetch, so the site also works
// when index.html is opened directly from the file system (file://), where fetch is blocked.
function bundleAssets() {
    log('bundling the REPL files into repl/assets.js');
    const dir = path.join(DIST, 'repl');
    const files = {
        worker: ['repl-worker.js', 'utf8'],
        formatWorker: ['format-worker.js', 'utf8'],
        elmHome: ['elm-home.dat', 'base64'],
        project: ['project.dat', 'base64'],
    };
    const assets = {};
    for (const [key, [name, encoding]] of Object.entries(files)) {
        assets[key] = fs.readFileSync(path.join(dir, name)).toString(encoding);
        fs.rmSync(path.join(dir, name));
    }
    writeFile(path.join(dir, 'assets.js'), 'window.replAssetData = ' + JSON.stringify(assets) + ';\n');
}

function copyWebFiles() {
    log('copying web files');
    copyDir(path.join(ROOT, 'src', 'web'), DIST);
    const vendor = {
        'monaco-editor/min': 'monaco-editor/min',
        'monaco-vim/dist': 'monaco-vim/dist',
        'xterm/lib': 'xterm',
        'xterm/css': 'xterm/css',
        'xterm-addon-fit/lib': 'xterm-addon-fit',
        'jquery/dist': 'jquery',
        'jquery-resizable-dom/dist': 'jquery-resizable-dom',
        'jquery-resizable-dom/assets': 'jquery-resizable-dom/assets',
    };
    for (const [from, to] of Object.entries(vendor)) {
        copyDir(path.join(NODE_MODULES, from), path.join(DIST, 'static', to));
    }
}

async function main() {
    if (process.argv.includes('--clean')) {
        rmrf(BUILD);
    }
    rmrf(DIST);
    fs.mkdirSync(DIST, { recursive: true });

    const replWorkerDir = fetchReplWorker();
    preparePackages(JSON.parse(fs.readFileSync(path.join(replWorkerDir, 'elm.json'), 'utf8')));
    buildFileSystems();
    await buildReplWorker(replWorkerDir);
    await buildFormatWorker();
    bundleAssets();
    copyWebFiles();
    log('done, the static site is in ' + path.relative(process.cwd(), DIST) + '/');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
