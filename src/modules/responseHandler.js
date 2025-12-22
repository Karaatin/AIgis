/*
 * AIgis - Response Handler
 * Manages secure badges, smart copy interception, and global peek features.
 */
/* src/modules/responseHandler.js */

import { ToonConverter } from './toonConverter.js';

export const ResponseHandler = {
    
    vaultCache: {}, 
    observer: null,
    isPeekActive: false,
    debounceTimer: null,

    init() {
        document.addEventListener('copy', (e) => this.handleSmartCopy(e));
        this.startObserver();
    },

    updateVault(vaultData) {
        this.vaultCache = vaultData.mappings || {};
    },

    startObserver() {
        if (this.observer) return;

        this.observer = new MutationObserver((mutations) => {
            const shouldScan = mutations.some(m => 
                m.type === 'childList' && m.addedNodes.length > 0 || 
                m.type === 'characterData'
            );

            if (shouldScan) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.scanDOM();   // Scan PII
                    this.scanToon();  // Scan TOON
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

    // --- PII Scan ---
    scanDOM() {
        const placeholderRegex = /\[[A-Z]+_\d+\]/g;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const nodesToReplace = [];
        let node;

        while (node = walker.nextNode()) {
            if (node.parentElement && 
               (node.parentElement.classList.contains('aigis-badge') || 
                node.parentElement.classList.contains('aigis-json-content') ||
                ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE'].includes(node.parentElement.tagName))) {
                continue;
            }

            if (placeholderRegex.test(node.nodeValue)) {
                nodesToReplace.push(node);
            }
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
            
            textNode.parentNode.replaceChild(fragment, textNode);
        });
    },

    scanToon() {
        const codeBlocks = document.querySelectorAll('code, pre');

        codeBlocks.forEach(block => {
            if (block.closest('.aigis-json-block')) return;

            const text = block.innerText || "";
            
            if (text.includes('AIgis:TOON')) {
                
                const parts = text.split('AIgis:TOON');
                if (parts.length < 2) return;

                const rawContent = parts[1].trim();
                
                const jsonString = ToonConverter.decodeRaw(rawContent);
                
                if (jsonString) {
                    this.replaceWithJsonBlock(block, jsonString);
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

        const target = (originalNode.tagName === 'CODE' && originalNode.parentElement.tagName === 'PRE') 
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

        const original = this.vaultCache[placeholder];
        if (original) {
            const preview = original.length > 8 
                ? `${original.substring(0, 4)}...${original.substring(original.length - 4)}`
                : '***';
            span.title = `Original: ${preview}\n• Click to copy\n• Double-Click to reveal all`;
        } else {
            span.title = "Value not found in Vault";
        }

        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copySingle(placeholder);
        });

        span.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleGlobalPeek();
        });

        return span;
    },

    async copySingle(placeholder) {
        const val = this.vaultCache[placeholder];
        if (val) {
            navigator.clipboard.writeText(val);
            this.showToast("🔓 Original value copied!");
        }
    },

    toggleGlobalPeek() {
        if (this.isPeekActive) return;
        this.isPeekActive = true;
        const badges = document.querySelectorAll('.aigis-badge');
        badges.forEach(b => {
            const ph = b.dataset.placeholder;
            const val = this.vaultCache[ph];
            if (val) {
                b.dataset.uiText = b.innerText;
                b.innerText = val;
                b.classList.add('revealed');
            }
        });
        setTimeout(() => {
            badges.forEach(b => {
                if (b.dataset.uiText) {
                    b.innerText = b.dataset.uiText;
                    b.classList.remove('revealed');
                }
            });
            this.isPeekActive = false;
        }, 5000);
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

        container.querySelectorAll('.aigis-badge').forEach(b => {
            const ph = b.dataset.placeholder;
            const original = this.vaultCache[ph] || ph;
            b.replaceWith(document.createTextNode(original));
        });

        container.querySelectorAll('.aigis-json-block').forEach(b => {
            const content = b.querySelector('.aigis-json-content').innerText;
            b.replaceWith(document.createTextNode(content));
        });

        const cleanText = container.innerText;
        if (e.clipboardData) {
            e.clipboardData.setData('text/plain', cleanText);
            this.showToast("📋 Copied with unmasked/decoded values!");
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