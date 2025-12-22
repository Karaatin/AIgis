import { describe, it, expect } from 'vitest';
import IBANMask from '../src/modules/piiMasks/piiMask-IBAN.js';

describe('PII Mask Logic: IBAN', () => {
    
    const mask = new IBANMask();
    const validIBAN = 'DE89370400440532013000'; 

    it('should detect a valid German IBAN (continuous)', () => {
        const text = `Here is my IBAN: ${validIBAN}`;
        const matches = Array.from(mask.find(text));
        expect(matches).toHaveLength(1);
        expect(matches[0][0]).toBe(validIBAN);
        expect(mask.validate(matches[0][0])).toBe(true);
    });

    it('should detect a valid IBAN with standard grouping', () => {

        const formatted = 'DE89 3704 0044 0532 0130 00';
        const matches = Array.from(mask.find(formatted));
        expect(matches[0][0]).toBe(formatted);
        expect(mask.validate(matches[0][0])).toBe(true);

    });

    it('should detect irregularly spaced IBANs (The "Greedy" Check)', () => {

        const weirdSpacing = 'DE893704 0044 0532 013000';
        const matches = Array.from(mask.find(weirdSpacing));
        expect(matches[0][0]).toBe(weirdSpacing);
        expect(mask.validate(matches[0][0])).toBe(true);

    });

    it('should NOT capture text following the IBAN (The "Trailing Word" Fix)', () => {

        const text = `${validIBAN} now`; 
        const matches = Array.from(mask.find(text));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][0]).toBe(validIBAN); 

    });

    it('should handle IBANs at the end of a sentence correctly', () => {

        const text = `Send money to ${validIBAN}.`;
        const matches = Array.from(mask.find(text));
        expect(matches[0][0]).toBe(validIBAN);

    });

    it('should reject invalid checksums via validate()', () => {

        const invalidIBAN = 'DE89370400440532013001'; 
        const matches = Array.from(mask.find(invalidIBAN));
        
        expect(matches).toHaveLength(1);
        expect(mask.validate(matches[0][0])).toBe(false);

    });

});