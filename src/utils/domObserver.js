/*
 * AIgis - DOM Observer
 * Handles DOM traversal, input detection, and UI highlighting.
 */
export const DomObserver = {

    capturedEvent: null,
    isReleasing: false,

    /**
     * Saves an event to be re-dispatched later (after scanning)
     */
    captureClick(e) {
        this.capturedEvent = {
            target: e.target,
            eventType: e.type,
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            view: e.view
        };
    },

    releaseClick() {
        if (!this.capturedEvent) return;

        const { target, eventType, bubbles, cancelable, view } = this.capturedEvent;
        
        this.isReleasing = true;

        try {

            if (typeof target.click === 'function') {
                target.click();
            } else {

                const event = new MouseEvent(eventType, {
                    bubbles: bubbles,
                    cancelable: cancelable,
                    view: view
                });
                target.dispatchEvent(event);
            }
        } catch (err) {
            console.error("🛡️ [AIgis] Error releasing click:", err);
        }

        this.capturedEvent = null;
        
        setTimeout(() => {
            this.isReleasing = false;
        }, 50);
    },

    releaseEnter(element) {
        this.isReleasing = true;
        
        const eventOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
        element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

        setTimeout(() => {
            this.isReleasing = false;
        }, 50);
    },

    getDeepActiveElement() {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return el;
    },

    findChatInput(eventTarget = null) {
        if (this.isBlockedContext()) return null;

        if (eventTarget) {

            const el = eventTarget.nodeType === 3 ? eventTarget.parentElement : eventTarget;
            
            const claude = el.closest('.ProseMirror');
            if (claude) return claude;
            
            const editable = el.closest('[contenteditable="true"]');
            if (editable) return editable;
            
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el;
        }

        const byId = document.getElementById('prompt-textarea');
        if (byId) return byId;

        const byRole = document.querySelector('div[role="textbox"]');
        if (byRole && byRole.offsetParent !== null) return byRole;

        const active = this.getDeepActiveElement();
        if (active) {
            if (active.closest('.ProseMirror')) return active.closest('.ProseMirror');
            if (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') return active;
            if (active.isContentEditable) return active.closest('[contenteditable="true"]') || active;
        }

        const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        const visibleEd = editables.filter(el => el.offsetParent !== null && el.clientHeight > 20);
        if (visibleEd.length > 0) return visibleEd[visibleEd.length - 1];

        const textareas = Array.from(document.querySelectorAll('textarea'));
        const visibleTa = textareas.filter(el => el.offsetParent !== null && el.clientHeight > 20);
        if (visibleTa.length > 0) return visibleTa[visibleTa.length - 1];

        return null;
    },

    isSendButton(element) {
        if (!element) return false;
        
        const btn = element.closest('button') || element.closest('[role="button"]') || element.closest('a');
        
        const allText = (
            (btn?.innerText || "") + (btn?.getAttribute('aria-label') || "") + 
            (btn?.getAttribute('title') || "") + (btn?.getAttribute('data-testid') || "") +
            (element.getAttribute('aria-label') || "")
        ).toLowerCase();

        const forbidden = ['copy', 'clipboard', 'kopieren', 'login', 'sign', 'edit', 'regenerate', 'new chat', 'settings', 'user', 'menu', 'profile', 'attach', 'upload', 'file', 'clip', 'image', 'photo', 'camera', 'search', 'globe', 'browse', 'voice', 'mic', 'microphone', 'style', 'stop'];
        if (forbidden.some(word => allText.includes(word))) return false;

        if (btn?.getAttribute('data-testid') === 'send-button') return true;
        if (['send', 'senden', 'submit', 'message', 'ask', 'prompt', 'abschicken'].some(kw => allText.includes(kw))) return true;

        const input = this.findChatInput();
        if (!input) return false;

        if (btn && btn.innerText.trim().length > 0 && !['send', 'go', 'arrow', '↑'].some(s => btn.innerText.toLowerCase().includes(s))) return false;

        const container = this.getCommonContainer(input, 6);
        if (btn && container && container.contains(btn)) return true;
        
        if (!btn && element.tagName === 'svg' && container && container.contains(element)) return true;

        return false; 
    },

    getCommonContainer(element, levels) {
        let current = element;
        for (let i = 0; i < levels; i++) {
            if (current.parentElement) current = current.parentElement;
            else if (current.parentNode && current.parentNode.host) current = current.parentNode.host;
            else break;
        }
        return current;
    },

    isBlockedContext() {
        const url = window.location.href.toLowerCase();
        return ['/login', '/auth', '/signin', '/signup'].some(p => url.includes(p));
    },

    readText(element) {
        if (!element) return "";
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') return element.value;
        
        let text = element.innerText;
        if (text && text.trim().length > 0) return text;

        text = element.textContent;
        if (text && text.trim().length > 0) return text;

        return "";
    },

    writeText(element, newText) {
        element.focus();

        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            const proto = Object.getPrototypeOf(element);
            const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            
            if (valueSetter) {
                valueSetter.call(element, newText);
            } else {
                element.value = newText;
            }
            
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

        } else {

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);

            const success = document.execCommand('insertText', false, newText);

            if (!success) {
                element.innerText = newText;
            }
        }

        setTimeout(() => {
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }, 10);
    },

    highlight(element, color = "red", duration = 800) {
        if (!element) return;
        
        const originalTransition = element.style.transition;
        const originalOutline = element.style.outline;
        const originalBoxShadow = element.style.boxShadow;

        element.style.transition = "all 0.2s ease";
        element.style.outline = `3px solid ${color}`;
        element.style.boxShadow = `0 0 15px ${color}`;

        setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.boxShadow = originalBoxShadow;
            setTimeout(() => {
                element.style.transition = originalTransition;
            }, 200);
        }, duration);
    },

};