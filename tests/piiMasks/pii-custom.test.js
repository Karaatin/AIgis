import { describe, it, expect } from 'vitest';
import CustomMask from '../../src/modules/piiMasks/piiMask-Custom.js';

describe('PII Mask Logic: Custom Dictionary', () => {

    it('should detect simple names', () => {

        const words = ['Müller', 'Schmidt'];
        const mask = new CustomMask(words);

        const text = "The Meeting is with Mr. Müller and Mrs. Schmidt.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('Müller');
        expect(matches[1][0]).toBe('Schmidt');

    });

    it('should be case insensitive', () => {

        const words = ['SecuredProject'];
        const mask = new CustomMask(words);

        const text = "We are working on the securedproject.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('securedproject');

    });

    it('should handle special characters (Escaping)', () => {

        const words = ['C++', 'Node.js'];
        const mask = new CustomMask(words);

        const text = "Developer skills: C++ and Node.js required.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('C++');
        expect(matches[1][0]).toBe('Node.js');

    });

    it('should match longer words first (Greedy)', () => {

        const words = ['Super', 'Superman'];
        const mask = new CustomMask(words);

        const text = "Clark Kent is Superman.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('Superman');

    });

    it('should allow updating the word list dynamically', () => {

        const mask = new CustomMask(['OldWord']);

        mask.updateWords(['NewWord']);

        const text = "OldWord vs NewWord";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('NewWord');

    });

    it('should support literal regular expressions wrapped in slashes', () => {

        const words = ['/USR-\\d{3}/', '/API_[A-Z0-9]{5}/'];
        const mask = new CustomMask(words);

        const text = "Delete user USR-123 and rotate key API_X9A2B immediately.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('USR-123');
        expect(matches[1][0]).toBe('API_X9A2B');

    });

    it('should support native RegExp objects', () => {

        const words = [/USR-\d{3}/, /API_[A-Z0-9]{5}/];
        const mask = new CustomMask(words);

        const text = "Delete user USR-123 and rotate key API_X9A2B immediately.";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('USR-123');
        expect(matches[1][0]).toBe('API_X9A2B');

    });

    describe('Per-pattern regex flags', () => {

        it('should keep legacy case-insensitive default for /pattern/ without flags', () => {
            const mask = new CustomMask(['/SECRET-\\d+/']);
            const matches = Array.from(mask.find('found secret-42 here')).map(m => m[0]);
            expect(matches).toContain('secret-42');
        });

        it('should match case-SENSITIVELY when explicit flags omit i (e.g. /Foo/m)', () => {
            const mask = new CustomMask(['/Codename/m']);

            const hit = Array.from(mask.find('Project Codename launched')).map(m => m[0]);
            expect(hit).toContain('Codename');

            const miss = Array.from(mask.find('project codename launched'));
            expect(miss.length).toBe(0);
        });

        it('should mix flag groups: sensitive and insensitive patterns side by side', () => {
            const mask = new CustomMask(['/Strict/s', '/loose/i', 'PlainWord']);

            const matches = Array.from(mask.find('Strict and LOOSE and plainword, but not strict.')).map(m => m[0]);
            expect(matches).toContain('Strict');
            expect(matches).toContain('LOOSE');
            expect(matches).toContain('plainword');
            expect(matches).not.toContain('strict');
        });

        it('should respect flags of native RegExp objects', () => {
            const mask = new CustomMask([/CaseMatters/m]);

            expect(Array.from(mask.find('CaseMatters here')).length).toBe(1);
            expect(Array.from(mask.find('casematters here')).length).toBe(0);
        });

        it('should strip unsupported flags like g instead of failing', () => {
            const mask = new CustomMask(['/repeat/g']);
            // g is engine-managed; without remaining flags the legacy
            // case-insensitive default applies
            const matches = Array.from(mask.find('REPEAT repeat')).map(m => m[0]);
            expect(matches.length).toBe(2);
        });

    });

});