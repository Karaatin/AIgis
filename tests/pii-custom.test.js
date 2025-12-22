import { describe, it, expect } from 'vitest';
import CustomMask from '../src/modules/piiMasks/piiMask-Custom.js';

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

});