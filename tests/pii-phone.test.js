import { describe, it, expect } from 'vitest';
import PhoneMask from '../src/modules/piiMasks/piiMask-Phone.js';

describe('PII Mask Logic: Phone Numbers', () => {
    
    const mask = new PhoneMask();

    it('should detect international numbers (+49)', () => {
        const text = "Call me at +49 176 12345678 or +1-555-0199.";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(mask.validate(matches[0][0])).toBe(true); 
        expect(matches[0][0]).toBe('+49 176 12345678');
    });

    it('should detect German national numbers (030...)', () => {
        const text = "Berlin office: 030/123456 or Munich (089) 98765432.";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('030/123456');
        expect(matches[1][0]).toBe('(089) 98765432');
    });

    it('should detect numbers with hyphens', () => {
        const text = "Mobile: 0171-1234567";
        const matches = Array.from(mask.find(text));
        
        expect(matches[0][0]).toBe('0171-1234567');
    });

    it('should IGNORE Dates (ISO Format)', () => {
        const text = "Meeting is on 2023-12-24.";
        const matches = Array.from(mask.find(text));

        if (matches.length > 0) {
            const isValid = mask.validate(matches[0][0]);
            expect(isValid).toBe(false);
        } else {
            expect(matches.length).toBe(0);
        }
    });

    it('should IGNORE simple prices or math', () => {
        const text = "I paid 100 - 20 Euro.";
        const matches = Array.from(mask.find(text));
        
        if (matches.length > 0) {
            expect(mask.validate(matches[0][0])).toBe(false);
        } else {
            expect(matches.length).toBe(0);
        }
    });
});