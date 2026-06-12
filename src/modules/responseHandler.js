/*
 * AIgis - Response Handler
 * Manages secure badges, smart copy interception, and global peek features.
*/

import { ToonConverter } from './toonConverter.js';
import { StorageManager } from '../utils/storage.js';
import { Logger } from '../utils/logger.js';

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

    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver((mutations) => {
            let shouldScan = false;

            mutations.forEach(m => {
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
                    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
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
            if (rootNode.nodeType === Node.ELEMENT_NODE) {
                if (rootNode.tagName === 'CODE' || rootNode.tagName === 'PRE') {
                    codeBlocks.add(rootNode);
                }
                const blocks = rootNode.querySelectorAll('code, pre');
                blocks.forEach(b => codeBlocks.add(b));
            }
        });

        codeBlocks.forEach(block => {
            if (block.closest('.aigis-json-block')) return;

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
            target.parentNode.replaceChild(container, target);
        }
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

        span.addEventListener('mouseenter', () => {
            if (this.isPeekActive) return;
            if (original) {
                if (!span.dataset.uiText) {
                    span.dataset.uiText = span.innerText;
                }
                span.innerText = original;
                span.classList.add('revealed');
            }
        });

        span.addEventListener('mouseleave', () => {
            if (this.isPeekActive) return;
            if (original && span.dataset.uiText) {
                span.innerText = span.dataset.uiText;
                span.classList.remove('revealed');
                delete span.dataset.uiText;
            }
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
            this.showToast("🔓 Original value copied!");
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

        if (!hasCustomElements) return;

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