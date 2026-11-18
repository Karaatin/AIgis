/*
 * AIgis - Clipboard Bridge
 */
(() => {
    if (typeof Clipboard === 'undefined') return;

    // events shared with responseHandler.js
    const REQUEST = 'aigis:clipboard';
    const DONE = 'aigis:clipboard-done';
    const TIMEOUT_MS = 2000;
    const RELEVANT = /[A-Z]_\d|AIgis:TOON/;

    const { writeText, write } = Clipboard.prototype;
    const pending = new Map();
    let lastId = 0;

    const settle = (id, ok) => {
        const resolve = pending.get(id);
        if (!resolve) return;
        pending.delete(id);
        resolve(ok);
    };

    document.addEventListener(DONE, (e) => {
        try {
            const { id, ok } = JSON.parse(e.detail);
            settle(id, ok === true);
        } catch { }
    });

    // resolves to true once the content script wrote the clipboard, null if it didn't take the copy
    function relay(data) {
        const id = ++lastId;
        const done = new Promise(resolve => pending.set(id, resolve));
        const taken = !document.dispatchEvent(new CustomEvent(REQUEST, { cancelable: true, detail: JSON.stringify({ id, ...data }) }));
        if (!taken) {
            pending.delete(id);
            return null;
        }
        const timer = setTimeout(() => settle(id, false), TIMEOUT_MS);
        return done.finally(() => clearTimeout(timer));
    }

    // a single item with text/plain and/or text/html, anything else is passed through
    async function readItems(items) {
        const list = Array.from(items);
        if (list.length !== 1 || !(list[0] instanceof ClipboardItem)) return null;
        const { types } = list[0];
        if (!types.length || types.some(type => type !== 'text/plain' && type !== 'text/html')) return null;
        const data = {};
        for (const type of types) {
            data[type === 'text/plain' ? 'plain' : 'html'] = await (await list[0].getType(type)).text();
        }
        return data;
    }

    Clipboard.prototype.writeText = function (text) {
        const done = typeof text === 'string' && RELEVANT.test(text) ? relay({ plain: text }) : null;
        if (!done) return writeText.call(this, text);
        // site copies as usual if writing the unmasked text failed
        return done.then(ok => ok ? undefined : writeText.call(this, text));
    };

    Clipboard.prototype.write = function (items) {
        return readItems(items).catch(() => null).then(data => {
            const done = data && RELEVANT.test(`${data.plain ?? ''}${data.html ?? ''}`) ? relay(data) : null;
            if (!done) return write.call(this, items);
            return done.then(ok => ok ? undefined : write.call(this, items));
        });
    };
})();
