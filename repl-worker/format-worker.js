// Web Worker that formats Elm code like elm-format.
//
// Uses the elm-format port contained in Guida (https://github.com/guida-lang/compiler).
// Guida replaces the global XMLHttpRequest with a mock to talk to its compiled Elm code,
// so it runs in its own worker, isolated from the page.
//
// Message from the page: { id, source }
// Message to the page:   { id, formatted } or { id, error }

import * as guida from 'guida';

// Formatting does not touch the file system, but guida expects a complete config object.
const config = {
    XMLHttpRequest: undefined,
    env: {},
    writeFile: async () => {},
    readFile: async () => { throw new Error('no file system'); },
    readDirectory: async () => ({ files: [] }),
    createDirectory: async () => {},
    details: async () => ({ type: 'file' }),
    getCurrentDirectory: async () => '/',
    homedir: async () => '/',
    lockFile: async () => {},
    unlockFile: async () => {},
};

self.onmessage = async (event) => {
    const { id, source } = event.data;
    try {
        const result = await guida.format(config, source);
        if (result && typeof result.output === 'string') {
            self.postMessage({ id, formatted: result.output });
        } else {
            self.postMessage({ id, error: 'The code could not be parsed. Please fix syntax errors first.' });
        }
    } catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};
