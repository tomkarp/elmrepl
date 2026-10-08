// Web Worker that formats Elm code like elm-format.
//
// Uses the elm-format port contained in Guida (https://github.com/guida-lang/compiler).
// Guida replaces the global XMLHttpRequest with a mock to talk to its compiled Elm code,
// so it runs in its own worker, isolated from the page.
//
// The port is not identical to elm-format and has a few bugs that can damage code (see "Limits"
// in README.md), so the result is checked before it is used: comments must not get lost and
// formatting the result again must not change it. Otherwise the code is left as it is.
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

const NOT_CHANGED = 'The code was not changed, because ';

async function guidaFormat(source) {
    const result = await guida.format(config, source);
    if (!(result && typeof result.output === 'string')) return null;
    const formatted = fixEscapes(result.output);
    return sameComments(source, formatted) ? restoreBlockComments(source, formatted) : undefined;
}

async function format(source) {
    const formatted = await guidaFormat(source);
    if (formatted === null) {
        return {
            error: 'The code could not be parsed. Please fix syntax errors first.\n\n'
                + '(The formatter does not support all valid Elm code, e.g. names with umlauts like größe.)',
        };
    }
    if (formatted === undefined) {
        return { error: NOT_CHANGED + 'the formatter would have removed or changed comments.' };
    }
    const again = await guidaFormat(formatted);
    if (again !== formatted) {
        return { error: NOT_CHANGED + 'the formatter does not work correctly for this code (e.g. for comments starting with {-- ).' };
    }
    return { formatted };
}


// TOKENS

// Splits Elm code into comments, string and char literals and the code in between.
function tokenize(code) {
    const tokens = [];
    let i = 0;
    let start = 0;
    const push = (type, end) => {
        if (start < i) tokens.push({ type: 'code', text: code.slice(start, i) });
        tokens.push({ type, text: code.slice(i, end) });
        i = end;
        start = end;
    };
    while (i < code.length) {
        if (code.startsWith('--', i)) {
            const end = code.indexOf('\n', i);
            push('comment', end < 0 ? code.length : end);
        } else if (code.startsWith('{-', i)) {
            let depth = 0;
            let j = i;
            while (j < code.length) {
                if (code.startsWith('{-', j)) { depth++; j += 2; }
                else if (code.startsWith('-}', j)) { depth--; j += 2; if (depth === 0) break; }
                else j++;
            }
            push('comment', j);
        } else if (code.startsWith('"""', i)) {
            push('literal', literalEnd(code, i + 3, '"""'));
        } else if (code[i] === '"' || code[i] === '\'') {
            push('literal', literalEnd(code, i + 1, code[i]));
        } else {
            i++;
        }
    }
    if (start < code.length) tokens.push({ type: 'code', text: code.slice(start) });
    return tokens;
}

function literalEnd(code, i, quote) {
    while (i < code.length) {
        if (code[i] === '\\') i += 2;
        else if (code.startsWith(quote, i)) return i + quote.length;
        else if (quote !== '"""' && code[i] === '\n') return i;
        else i++;
    }
    return code.length;
}


// ESCAPES

// Guida writes \u{1F648} as 🙈 (UTF-16 code units like JavaScript), which is not valid
// Elm. This turns such escapes in string and char literals back into \u{...}.
function fixEscapes(code) {
    const escape = /\\\\|\\u(D[89AB][0-9A-F]{2})\\u(D[C-F][0-9A-F]{2})|\\u([0-9A-F]{4})/gi;
    return tokenize(code).map((token) => token.type !== 'literal' ? token.text
        : token.text.replace(escape, (match, high, low, single) => {
            if (high !== undefined) {
                const codePoint = 0x10000 + (parseInt(high, 16) - 0xD800) * 0x400 + (parseInt(low, 16) - 0xDC00);
                return '\\u{' + codePoint.toString(16).toUpperCase() + '}';
            }
            return single === undefined ? match : '\\u{' + single.toUpperCase() + '}';
        })).join('');
}


// COMMENTS

function comments(code) {
    return tokenize(code).filter((token) => token.type === 'comment');
}

// without delimiters and with normalized whitespace
function commentText(token) {
    return token.text.replace(/^(--|\{-\|?)|-\}$/g, '').replace(/\s+/g, ' ').trim();
}

// The text of all comments must be the same before and after formatting
// (elm-format only changes the whitespace in comments).
function sameComments(source, formatted) {
    const texts = (code) => comments(code).map(commentText).sort();
    return JSON.stringify(texts(source)) === JSON.stringify(texts(formatted));
}

// Guida indents the lines of multi-line block comments a bit more every time the code is
// formatted, so the block comments are taken over from the source as they were written.
function restoreBlockComments(source, formatted) {
    const original = comments(source);
    const tokens = tokenize(formatted);
    const result = comments(formatted);
    if (original.length !== result.length || original.some((token, i) => commentText(token) !== commentText(result[i]))) {
        return formatted;
    }
    let index = 0;
    return tokens.map((token) => {
        if (token.type !== 'comment') return token.text;
        const originalText = original[index++].text;
        return token.text.startsWith('{-') ? originalText : token.text;
    }).join('');
}


self.onmessage = async (event) => {
    const { id, source } = event.data;
    try {
        self.postMessage({ id, ...(await format(source)) });
    } catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};
