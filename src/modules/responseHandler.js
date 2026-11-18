/*
 * AIgis - Response Handler
 * Manages secure badges, smart copy interception, and global peek features.
*/

import { ToonConverter } from './toonConverter.js';
import { StorageManager } from '../utils/storage.js';
import { Logger } from '../utils/logger.js';

// chat input is never scanned
const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"]), textarea, input';

// [EMAIL_1], or EMAIL_1 as shown by a badge
const PLACEHOLDER_OR_LABEL = /\[([A-Z_]+_\d+)\]|\b([A-Z_]+_\d+)\b/g;

// events shared with public/clipboard-bridge.js
const CLIPBOARD_REQUEST = 'aigis:clipboard';
const CLIPBOARD_DONE = 'aigis:clipboard-done';

export const ResponseHandler = {

    vaultCache: {},
    observer: null,
    isPeekActive: false,
    isPeekKeyDown: false,
    isSettingsPeek: false,
    debounceTimer: null,
    pendingNodes: new Set(),

    init() {
        document.addEventListener('copy', (e) => this.handleSmartCopy(e), { capture: true });
        // runs after copy handlers of the site
        window.addEventListener('copy', (e) => this.unmaskCopyData(e));
        document.addEventListener(CLIPBOARD_REQUEST, (e) => this.handleClipboardRelay(e));

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Backquote') {
                if (this.isSettingsPeek || this.isPeekKeyDown) return;
                this.isPeekKeyDown = true;
                this.applyGlobalPeek(true);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Backquote') {
                this.isPeekKeyDown = false;
                if (!this.isSettingsPeek) {
                    this.applyGlobalPeek(false);
                }
            }
        });

        if (typeof chrome !== 'undefined' && chrome.storage) {
            const applyPeekFromSettings = async () => {
                const eff = await StorageManager.getEffectiveSettings();
                this.isSettingsPeek = !!eff.settings.peekMode;
                this.applyGlobalPeek(this.isSettingsPeek || this.isPeekKeyDown);
            };

            applyPeekFromSettings();

            chrome.storage.onChanged.addListener((changes, namespace) => {
                if ((namespace === 'sync' && (changes.settings || changes.subscriptions)) ||
                    (namespace === 'local' && changes.subscriptionData)) {
                    applyPeekFromSettings();
                }
            });
        }

        this.startObserver();
    },

    updateVault(vaultData) {
        this.vaultCache = vaultData.mappings || {};
        Logger.info(`ResponseHandler: vault cache updated (${Object.keys(this.vaultCache).length} mappings).`);
    },

    getOriginalValue(ph) {
        const entry = this.vaultCache[ph];
        if (!entry) return null;
        return typeof entry === 'object' ? entry.val : entry;
    },

    isInEditable(node) {
        const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
        return !!(el && el.closest(EDITABLE_SELECTOR));
    },

    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver((mutations) => {
            let shouldScan = false;

            mutations.forEach(m => {
                // skip chat input
                if (this.isInEditable(m.target)) return;

                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
                        this.pendingNodes.add(node);
                        shouldScan = true;
                    });
                } else if (m.type === 'characterData') {
                    this.pendingNodes.add(m.target);
                    shouldScan = true;
                }
            });

            if (shouldScan) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const nodesToProcess = Array.from(this.pendingNodes);
                    this.pendingNodes.clear();

                    this.scanDOM(nodesToProcess);   // Scan PII
                    this.scanToon(nodesToProcess);  // Scan TOON
                }, 300);
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    },

    stopObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },

    // PII Scan
    scanDOM(nodes = null) {
        if (!nodes) nodes = [document.body];

        const placeholderRegex = /\[[A-Z_]+_\d+\]/g;
        const nodesToReplace = [];

        nodes.forEach(rootNode => {
            // check if detached
            if (!rootNode.isConnected) return;
            if (this.isInEditable(rootNode)) return;

            if (rootNode.nodeType === Node.TEXT_NODE) {
                if (rootNode.parentElement &&
                    (rootNode.parentElement.classList.contains('aigis-badge') ||
                        rootNode.parentElement.classList.contains('aigis-json-content') ||
                        ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(rootNode.parentElement.tagName))) {
                    return;
                }
                placeholderRegex.lastIndex = 0;
                if (placeholderRegex.test(rootNode.nodeValue)) {
                    nodesToReplace.push(rootNode);
                }
                return;
            }

            if (rootNode.nodeType === Node.ELEMENT_NODE) {
                try {
                    // elements only to reject editable subtrees
                    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
                        acceptNode: (n) => n.nodeType === Node.TEXT_NODE
                            ? NodeFilter.FILTER_ACCEPT
                            : (n.matches(EDITABLE_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP)
                    });
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.parentElement &&
                            (node.parentElement.classList.contains('aigis-badge') ||
                                node.parentElement.classList.contains('aigis-json-content') ||
                                ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(node.parentElement.tagName))) {
                            continue;
                        }

                        placeholderRegex.lastIndex = 0;
                        if (placeholderRegex.test(node.nodeValue)) {
                            nodesToReplace.push(node);
                        }
                    }
                } catch (e) { }
            }
        });

        if (nodesToReplace.length > 0) {
            Logger.info(`ResponseHandler: rendering badges in ${nodesToReplace.length} text node(s).`);
        }

        nodesToReplace.forEach(textNode => {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;
            placeholderRegex.lastIndex = 0;

            while ((match = placeholderRegex.exec(textNode.nodeValue)) !== null) {
                const before = textNode.nodeValue.substring(lastIndex, match.index);
                if (before) fragment.appendChild(document.createTextNode(before));
                fragment.appendChild(this.createBadge(match[0]));
                lastIndex = placeholderRegex.lastIndex;
            }
            const after = textNode.nodeValue.substring(lastIndex);
            if (after) fragment.appendChild(document.createTextNode(after));

            if (textNode.parentNode) {
                textNode.parentNode.replaceChild(fragment, textNode);
            }
        });
    },

    scanToon(nodes = null) {
        if (!nodes) nodes = [document.body];

        const codeBlocks = new Set();

        nodes.forEach(rootNode => {
            if (this.isInEditable(rootNode)) return;
            if (rootNode.nodeType === Node.ELEMENT_NODE) {
                if (rootNode.tagName === 'CODE' || rootNode.tagName === 'PRE') {
                    codeBlocks.add(rootNode);
                }
                const blocks = rootNode.querySelectorAll('code, pre');
                blocks.forEach(b => codeBlocks.add(b));
            }
        });

        codeBlocks.forEach(block => {
            if (block.closest('.aigis-json-block') || block.closest(EDITABLE_SELECTOR)) return;

            const text = block.innerText || "";

            if (text.includes('AIgis:TOON')) {

                const parts = text.split('AIgis:TOON');
                if (parts.length < 2) return;

                const rawContent = parts[1].trim();

                const jsonString = ToonConverter.decodeRaw(rawContent);

                if (jsonString) {
                    Logger.info("ResponseHandler: TOON block detected and decoded to JSON panel.");
                    this.replaceWithJsonBlock(block, jsonString);
                } else {
                    Logger.warn("ResponseHandler: TOON marker found but decode failed. Block left as-is (right-click decode available).");
                }
            }
        });
    },

    replaceWithJsonBlock(originalNode, jsonString) {
        const container = document.createElement('div');
        container.className = 'aigis-json-block';

        const header = document.createElement('div');
        header.className = 'aigis-json-header';
        header.innerHTML = `
            <span>⚡ TOON Decoded</span>
            <button class=\"aigis-copy-btn\">Copy JSON</button>
        `;

        const content = document.createElement('div');
        content.className = 'aigis-json-content';
        content.textContent = jsonString;

        const btn = header.querySelector('button');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(jsonString);
            btn.textContent = "Copied!";
            setTimeout(() => btn.textContent = "Copy JSON", 2000);
        });

        container.appendChild(header);
        container.appendChild(content);

        const target = (originalNode.tagName === 'CODE' && originalNode.parentElement && originalNode.parentElement.tagName === 'PRE')
            ? originalNode.parentElement
            : originalNode;

        if (target && target.parentNode) {
            container.style.margin = this.insetOf(target === originalNode ? [target] : [target, originalNode]);
            target.parentNode.replaceChild(container, target);
        }
    },

    insetOf(elements) {
        return ['Top', 'Right', 'Bottom', 'Left'].map(side => {
            let px = 0;
            for (const el of elements) {
                const cs = getComputedStyle(el);
                if (cs.display === 'inline') continue;
                px += (parseFloat(cs[`margin${side}`]) || 0) + (parseFloat(cs[`border${side}Width`]) || 0) + (parseFloat(cs[`padding${side}`]) || 0);
            }
            return `${Math.max(px, side === 'Top' || side === 'Bottom' ? 10 : 0)}px`;
        }).join(' ');
    },

    createBadge(placeholder) {
        const span = document.createElement('span');
        span.className = 'aigis-badge';
        span.dataset.placeholder = placeholder;
        span.contentEditable = "false";
        span.innerText = placeholder.replace('[', '').replace(']', '');

        const original = this.getOriginalValue(placeholder);
        if (original) {
            const preview = original.length > 8
                ? `${original.substring(0, 4)}...${original.substring(original.length - 4)}`
                : '***';
            span.title = `• Hover to reveal\n• Click to copy`;
        } else {
            span.title = "Value not found in Vault";
        }

        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copySingle(placeholder);
        });

        let hoverZone = null;

        const hide = () => {
            document.removeEventListener('mousemove', trackPointer, true);
            hoverZone = null;
            if (this.isPeekActive || !span.dataset.uiText) return;
            span.innerText = span.dataset.uiText;
            span.classList.remove('revealed');
            delete span.dataset.uiText;
        };

        // stays revealed while the pointer is on the badge or its old place
        const trackPointer = (e) => {
            const z = hoverZone;
            const inZone = e.clientX >= z.left && e.clientX <= z.right && e.clientY >= z.top && e.clientY <= z.bottom;
            if (!inZone && !span.contains(e.target)) hide();
        };

        span.addEventListener('mouseenter', () => {
            if (this.isPeekActive || !original || span.classList.contains('revealed')) return;
            hoverZone = span.getBoundingClientRect();
            document.addEventListener('mousemove', trackPointer, true);
            span.dataset.uiText = span.innerText;
            span.innerText = original;
            span.classList.add('revealed');
        });

        span.addEventListener('mouseleave', (e) => {
            if (!hoverZone || !e.relatedTarget) hide();
        });

        if (this.isPeekActive && original) {
            span.dataset.uiText = span.innerText;
            span.innerText = original;
            span.classList.add('revealed');
        }

        return span;
    },

    async copySingle(placeholder) {
        const val = this.getOriginalValue(placeholder);
        if (val) {
            navigator.clipboard.writeText(val);
            this.showToast("Original value copied!");
        }
    },

    applyGlobalPeek(shouldPeek) {
        if (this.isPeekActive === shouldPeek) return;
        this.isPeekActive = shouldPeek;

        Logger.info(`ResponseHandler: global peek ${shouldPeek ? 'enabled' : 'disabled'}.`);

        const badges = document.querySelectorAll('.aigis-badge');
        badges.forEach(b => {
            const ph = b.dataset.placeholder;
            const val = this.getOriginalValue(ph);
            if (!val) return;

            if (shouldPeek) {
                if (!b.dataset.uiText) {
                    b.dataset.uiText = b.innerText;
                }
                b.innerText = val;
                b.classList.add('revealed');
            } else {
                if (b.dataset.uiText) {
                    if (b.matches(':hover')) return;

                    b.innerText = b.dataset.uiText;
                    b.classList.remove('revealed');
                    delete b.dataset.uiText;
                }
            }
        });
    },

    handleSmartCopy(e) {
        // copy buttons using a hidden text field
        const field = e.target;
        if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
            this.unmaskCopyEvent(e, field.value.substring(field.selectionStart ?? 0, field.selectionEnd ?? 0));
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const container = document.createElement('div');
        let hasCustomElements = false;

        for (let i = 0; i < selection.rangeCount; i++) {
            const fragment = selection.getRangeAt(i).cloneContents();
            if (fragment.querySelector('.aigis-badge') || fragment.querySelector('.aigis-json-block')) {
                hasCustomElements = true;
            }
            container.appendChild(fragment);
        }

        if (!hasCustomElements) {
            // raw placeholders, e.g. temporary elements of copy buttons (editors and the JSON panel copy as usual)
            const anchor = selection.anchorNode;
            const el = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
            if (el && !el.closest(`${EDITABLE_SELECTOR}, .aigis-json-block`)) {
                this.unmaskCopyEvent(e, selection.toString());
            }
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        Logger.info("ResponseHandler: smart copy intercepted (unmasking badges / decoding TOON blocks).");

        container.querySelectorAll('.aigis-badge').forEach(b => {
            const ph = b.dataset.placeholder;
            const original = this.getOriginalValue(ph) || ph;
            b.replaceWith(document.createTextNode(original));
        });

        container.querySelectorAll('.aigis-json-block').forEach(b => {
            const content = b.querySelector('.aigis-json-content').innerText;
            b.replaceWith(document.createTextNode(content));
        });

        // temporarily append to DOM to ensure innerText renders newlines correctly
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.whiteSpace = 'pre-wrap';
        document.body.appendChild(container);

        const cleanText = container.innerText;

        document.body.removeChild(container);

        if (e.clipboardData) {
            e.clipboardData.setData('text/plain', cleanText);
            this.showToast("Copied with unmasked/decoded values!");
        }
    },

    unmaskCopyEvent(e, text) {
        const unmasked = this.unmaskPlain(text);
        if (unmasked === text || !e.clipboardData) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        e.clipboardData.setData('text/plain', unmasked);
        Logger.info("ResponseHandler: copy with raw placeholders unmasked.");
        this.showToast("Copied with unmasked values!");
    },

    unmaskCopyData(e) {
        if (!e.defaultPrevented || !e.clipboardData || e.target?.isContentEditable) return;

        const plain = e.clipboardData.getData('text/plain');
        const html = e.clipboardData.getData('text/html');
        const unmaskedPlain = plain && this.unmaskPlain(plain);
        const unmaskedHtml = html && this.unmaskHtml(html);
        if (unmaskedPlain === plain && unmaskedHtml === html) return;

        if (unmaskedPlain !== plain) e.clipboardData.setData('text/plain', unmaskedPlain);
        if (unmaskedHtml !== html) e.clipboardData.setData('text/html', unmaskedHtml);
        Logger.info("ResponseHandler: clipboard data of the site unmasked.");
        this.showToast("Copied with unmasked values!");
    },

    // copy buttons using the clipboard API
    handleClipboardRelay(e) {
        let request;
        try {
            request = JSON.parse(e.detail);
        } catch {
            return;
        }
        // user gestures only, so page scripts can't trigger it on their own
        if (!request || !navigator.userActivation?.isActive) return;

        const plain = typeof request.plain === 'string' ? this.unmaskPlain(request.plain) : undefined;
        const html = typeof request.html === 'string' ? this.unmaskHtml(request.html) : undefined;
        if (plain === request.plain && html === request.html) return;

        e.preventDefault();
        // only the result goes back to the page, never the text
        this.writeClipboard(plain, html).then(ok => {
            document.dispatchEvent(new CustomEvent(CLIPBOARD_DONE, { detail: JSON.stringify({ id: request.id, ok }) }));
        });
    },

    async writeClipboard(plain, html) {
        try {
            if (html === undefined) {
                await navigator.clipboard.writeText(plain);
            } else {
                const data = { 'text/html': new Blob([html], { type: 'text/html' }) };
                if (plain !== undefined) data['text/plain'] = new Blob([plain], { type: 'text/plain' });
                await navigator.clipboard.write([new ClipboardItem(data)]);
            }
            Logger.info("ResponseHandler: copy button intercepted (unmasking placeholders).");
            this.showToast("Copied with unmasked values!");
            return true;
        } catch (err) {
            Logger.warn("ResponseHandler: unmasked copy failed, the site copies as usual.", err);
            return false;
        }
    },

    unmaskText(text) {
        return text.replace(PLACEHOLDER_OR_LABEL, (match, bracketed, label) => {
            const placeholder = bracketed ? match : `[${label}]`;
            const original = this.getOriginalValue(placeholder);
            if (!original || (label && !this.hasBadge(placeholder))) return match;
            return original;
        });
    },

    unmaskPlain(text) {
        const unmaskValue = (key, value) => typeof value === 'string' ? this.unmaskText(value) : value;
        return this.unmaskText(text.includes('AIgis:TOON') ? ToonConverter.restore(text, unmaskValue) : text);
    },

    unmaskHtml(html) {
        if (!/[A-Z]_\d/.test(html)) return html;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        let changed = false;

        doc.querySelectorAll('.aigis-badge').forEach(badge => {
            const placeholder = badge.dataset.placeholder;
            badge.replaceWith(this.getOriginalValue(placeholder) || placeholder || badge.textContent);
            changed = true;
        });

        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = this.unmaskText(node.nodeValue);
            if (text !== node.nodeValue) {
                node.nodeValue = text;
                changed = true;
            }
        }

        return changed ? doc.documentElement.outerHTML : html;
    },

    hasBadge(placeholder) {
        return !!document.querySelector(`.aigis-badge[data-placeholder="${placeholder}"]`);
    },

    showToast(msg) {
        const old = document.querySelector('.aigis-toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.className = 'aigis-toast';
        toast.innerHTML = `<span>🛡️</span> ${msg}`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
};