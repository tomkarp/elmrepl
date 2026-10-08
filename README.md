# Online Elm REPL
## Why

If you want to learn or teach Elm, it is often useful to be able to enter and test small Elm programs in an online editor without having to create an Elm project and open a full blown IDE. Especially in schools, you often don't have the possibility to install arbitrary software or open the terminal. Additionally, it can be useful to share Elm programs via a link. The online REPL for Elm offers all of this.

## How it works

Everything runs in the browser. After the page has loaded, there is no further communication with the server.

* **REPL:** [elm-compiler-in-elm](https://github.com/pithub/elm-compiler-in-elm) is a port of the official Elm compiler (0.19.1) from Haskell to Elm. Its `elm repl` runs in a Web Worker ([elm-repl-worker](https://github.com/pithub/elm-repl-worker), with small additions in `repl-worker/`). The compiled code is evaluated in the same worker, so long computations don't block the page and endless loops can be interrupted with `Ctrl+C`.
* **Packages:** `elm/browser`, `elm/core`, `elm/html`, `elm/json`, `elm/random` and `elm/svg` (plus their dependencies `elm/time`, `elm/url` and `elm/virtual-dom`) are precompiled with the official Elm compiler at build time and shipped as a virtual file system. The editor content is the module `Main` in `src/Main.elm`.
* **Format:** The format button uses the elm-format port of [Guida](https://github.com/guida-lang/compiler), also in a Web Worker.
* **Editor and terminal:** [Monaco](https://github.com/microsoft/monaco-editor) (with [monaco-vim](https://github.com/brijeshb42/monaco-vim)) and [xterm.js](https://github.com/xtermjs/xterm.js), bundled into `vendor.js` at build time.
* **Offline:** https://elmrepl.de registers a service worker that keeps all files in the browser cache, so the page also works without internet after it has been opened once. A new version is downloaded in the background and used from the next page load on.

## Download (offline use without the website, e.g. in school)

A ready-to-use build is attached to the GitHub release and updated automatically on every push to `main`:
[elmrepl.zip](https://github.com/tomkarp/elmrepl/releases/download/main-latest/elmrepl.zip)

Unzip the file and open `elmrepl/index.html` in the browser (double-click). No server, no installation and no internet connection are needed. The folder `elmrepl` can also be served by any web server, e.g. a school server.

When the page is opened from the file system, share links point to the local file and only work on the same computer.

## Required software

To build the site you need *Node.js* (18 or newer), *npm* and *git*. The build downloads the Elm compiler port and the Elm packages from GitHub (it does not need package.elm-lang.org).

The result is a static website in `dist/` that can be opened directly or served by any web server.

## Build and run locally

```
git clone http://github.com/tomkarp/elmrepl
cd elmrepl
npm install
npm run build
npm start
```

Then open http://localhost:3000. `npm start` runs a minimal static file server for `dist/` (use `npm start -- 8080` for another port). Opening `dist/index.html` directly also works.

`npm run build` caches downloads in `build/`. Use `node scripts/build.js --clean` to start from scratch.

## Deployment

https://elmrepl.de is served by GitHub Pages: on every push to `main`, the GitHub Action `.github/workflows/release.yml` builds the site and deploys it (repository settings: Pages, source "GitHub Actions", custom domain `elmrepl.de`).

Alternatively, copy the content of `dist/` to any static web server. With https://caddyserver.com, the Caddyfile could look like this:

```
elmrepl.de {
        root * /pathtoyourelmrepl/elmrepl/dist
        file_server
        encode zstd gzip
}
```

All paths are relative, so the site also works in a subdirectory.

## Usage

The main usage should be quite obvious. Just type your Elm code in the editor and use it in the REPL.
The REPL always uses the current content of the editor: changes are picked up with the next input in the REPL, like in `elm repl`. Saving (`Ctrl+S`) is not necessary.

* `Ctrl+C` in the REPL interrupts a running computation (e.g. an endless loop). The REPL is restarted and previous inputs are restored. At the prompt, `Ctrl+C` discards the current input (or copies the selected text).
* Arrow keys, `Home`/`End` and the usual readline shortcuts (`Ctrl+A`, `Ctrl+E`, `Ctrl+U`, `Ctrl+K`, `Ctrl+W`, `Ctrl+L`) edit the input, `Up`/`Down` browse the history.
* `:exit` stops the REPL, the button "Restart" starts a fresh one.
* `Cmd/Ctrl+Shift+F` formats the code, the settings contain dark mode and Vim mode.

If you want to share the code, press the share button on the lower right. It copies a link to the clipboard that contains your compressed Elm program. The program is not stored anywhere, it is only contained in the link.

If you want you can use the URL parameters:

`compressed` - the editor content, gzip-compressed and base64-encoded (this is what the share button creates)

`code` - adds an Elm program to the editor (`module Main exposing (..)` is added in front)

`repl` - adds some text to the REPL (after `import Main exposing (..)`)

For `code` and `repl` you have to URL-encode the text, for example with an online URL encoder.

Here, you can find an example:

https://elmrepl.de?code=%0Asum%20n%20%3D%0A%20%20%20%20if%20n%20%3D%3D%201%20then%201%0A%20%20%20%20else%20n%20%2B%20sum%20%28n%20-%201%29&repl=sum%2010

## Differences to `elm repl`

The results of the REPL are the same as with the official `elm repl`. All examples of the Elm chapters of [inf-schule.de](https://inf-schule.de/deklarativ/fp_elm) give the same output, apart from details in error messages:

* The compiler port is based on Elm 0.19.1, so the REPL shows version 0.19.1 (the previous version of elmrepl.de used Elm 0.19.2, which differs only in a few error messages).
* The names suggested in "These names seem close though" (and similar lists like "Maybe you want one of the following?") are often different, because the port measures the similarity of names in a slightly different way.
* If `Main.elm` has several errors, often only some of them are reported, e.g. only the first unknown name in a list. The others are reported after fixing these.
* A few error messages are worded like in Elm 0.19.2 (fixed typos, the order of the two locations in "NAME CLASH"), and if a module has several type errors, they may be reported in a different order.

## Limits

* The compiler runs in the browser, where the call stack is limited. Very large or deeply nested code exceeds it, for example (measured in Chrome and Safari, the limits depend on the browser):
  * lists written in the code with more than about 1400 elements,
  * pipelines with more than about 120 `|>` steps,
  * chains of more than about 250 operators like `+`, `++` or `::`,
  * more than about 140 nested parentheses, 170 `else if` or 580 `case` branches,
  * more than about 700 top-level definitions in `Main.elm`.

  The REPL then shows "The code is too large or too deeply nested for the Elm compiler in the browser" and restarts with the previous inputs. The official compiler has no such limits.
* The compiled code runs in a Web Worker, which has a smaller stack than node used by `elm repl`. Recursive functions that are not tail-recursive can only call themselves about 4500 times in Chrome and 3000 times in Safari (`elm repl`: about 7400), otherwise the REPL shows `RangeError: Maximum call stack size exceeded` like `elm repl` does for deeper recursion. Tail-recursive functions are not limited.
* Like `elm repl`, every input compiles all definitions entered before, so inputs get slower in very long sessions (about 0.1 s per input after 300 definitions, 0.3 s after 800). `:reset` removes the definitions.
* The format button uses the elm-format port of Guida, not elm-format itself. Its result is checked before it is used: if comments would get lost or formatting again would change the code, the code is left unchanged and a message explains why. It cannot format some valid code, e.g. code with names like `größe`. Compared to elm-format, comments at the end of a line may be moved to a line of their own, and `\u{...}` escapes and numbers like `1.50` are kept as they are.

## Project structure

* `src/web/` - the web page (editor, terminal, REPL client in `repl.js`)
* `src/vendor.js` - entry point for bundling the third party libraries
* `src/service-worker.js` - service worker for offline use of the website (the build adds the file list)
* `repl-worker/` - REPL worker additions (`Worker.elm`, `host.js`) and the format worker
* `scripts/build.js` - builds `dist/`
* `scripts/serve.js` - static file server for local testing
* `.github/workflows/release.yml` - builds `elmrepl.zip`, publishes it as a release and deploys `main` to GitHub Pages

## Created by
https://github.com/leon-th

The REPL in the browser is based on [elm-compiler-in-elm](https://github.com/pithub/elm-compiler-in-elm) and [elm-repl-worker](https://github.com/pithub/elm-repl-worker) by Peter Capitain, formatting is based on [Guida](https://github.com/guida-lang/compiler) by Décio Ferreira.
