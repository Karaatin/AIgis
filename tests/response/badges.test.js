import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponseHandler } from '../../src/modules/responseHandler.js';

// minimal stand-ins for the DOM parts the badges use
function fakeTarget(props = {}) {
    const listeners = {};
    return {
        ...props,
        addEventListener(type, fn) { (listeners[type] ??= new Set()).add(fn); },
        removeEventListener(type, fn) { listeners[type]?.delete(fn); },
        fire(type, event = {}) { [...(listeners[type] ?? [])].forEach(fn => fn({ type, ...event })); },
        listenerCount(type) { return listeners[type]?.size ?? 0; }
    };
}

function fakeBadge() {
    const classes = new Set();
    const badge = fakeTarget({
        dataset: {},
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
        // the long value wraps the revealed badge into the next line
        getBoundingClientRect: () => classes.has('revealed')
            ? { left: 0, right: 320, top: 40, bottom: 60 }
            : { left: 100, right: 160, top: 10, bottom: 30 },
        contains: (node) => node === badge,
        matches: () => false
    });
    return badge;
}

describe('Badges: hover reveal', () => {

    const elsewhere = {};
    let doc;
    let badge;
    const revealed = () => badge.classList.contains('revealed');

    beforeEach(() => {
        doc = fakeTarget({ createElement: () => fakeBadge(), querySelectorAll: () => [badge] });
        vi.stubGlobal('document', doc);
        ResponseHandler.vaultCache = { '[EMAIL_1]': { val: 'john.doe@a-very-long-company-domain.com', expiresAt: Date.now() + 60000 } };
        badge = ResponseHandler.createBadge('[EMAIL_1]');
    });

    afterEach(() => {
        ResponseHandler.applyGlobalPeek(false);
        vi.unstubAllGlobals();
        ResponseHandler.vaultCache = {};
    });

    it('should stay revealed while the pointer is on the badge or its old place', () => {
        badge.fire('mouseenter');
        expect(badge.innerText).toBe('john.doe@a-very-long-company-domain.com');

        // wrapped badge moved away from the pointer
        badge.fire('mouseleave', { relatedTarget: elsewhere });
        doc.fire('mousemove', { clientX: 130, clientY: 20, target: elsewhere });
        doc.fire('mousemove', { clientX: 150, clientY: 50, target: badge });
        expect(revealed()).toBe(true);

        doc.fire('mousemove', { clientX: 400, clientY: 50, target: elsewhere });
        expect(revealed()).toBe(false);
        expect(badge.innerText).toBe('EMAIL_1');
        expect(doc.listenerCount('mousemove')).toBe(0);
    });

    it('should hide when the pointer leaves the window', () => {
        badge.fire('mouseenter');
        badge.fire('mouseleave', { relatedTarget: null });

        expect(revealed()).toBe(false);
    });

    it('should keep peek reveals and hide a hovered one on leave once peek is off', () => {
        ResponseHandler.applyGlobalPeek(true);
        badge.fire('mouseleave', { relatedTarget: elsewhere });
        expect(revealed()).toBe(true);

        badge.matches = () => true;
        ResponseHandler.applyGlobalPeek(false);
        expect(revealed()).toBe(true);

        badge.fire('mouseleave', { relatedTarget: elsewhere });
        expect(revealed()).toBe(false);
    });

});

describe('TOON panel: inset of the replaced code box', () => {

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const style = (display, padding, margin = [0, 0, 0, 0]) => Object.fromEntries([
        ['display', display],
        ...sides.flatMap((side, i) => [[`padding${side}`, `${padding[i]}px`], [`margin${side}`, `${margin[i]}px`], [`border${side}Width`, '0px']])
    ]);

    it('should keep margin, border and padding of block boxes, at least 10px above and below', () => {
        const pre = {}, blockCode = {}, inlineCode = {};
        const styles = new Map([
            [pre, style('block', [0, 28, 20, 0])],
            [blockCode, style('block', [8, 4, 0, 0])],
            [inlineCode, style('inline', [2, 4, 2, 4])]
        ]);
        vi.stubGlobal('getComputedStyle', (el) => styles.get(el));

        expect(ResponseHandler.insetOf([pre, inlineCode])).toBe('10px 28px 20px 0px');
        expect(ResponseHandler.insetOf([pre, blockCode])).toBe('10px 32px 20px 0px');
    });

});
