// Third party libraries of the web page. scripts/build.js bundles this file into vendor.js
// and vendor.css (Monaco without other languages, see the build script).

import * as monaco from 'monaco-editor/editor/editor.main.js';
import { initVimMode } from 'monaco-vim';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

window.monaco = monaco;
window.initVimMode = initVimMode;
window.Terminal = Terminal;
window.FitAddon = FitAddon;
