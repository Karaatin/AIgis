import { describe, it, expect } from 'vitest';
import AddressMask from '../src/modules/piiMasks/piiMask-Address.js';

describe('PII Mask Logic: Addresses', () => {
    
    const mask = new AddressMask();

    it('should detect standard German addresses', () => {

        const text = "Delivery to Musterstraße 12, 12345 Berlin please.";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('Musterstraße 12, 12345 Berlin');

    });

    it('should detect addresses with line breaks', () => {

        const text = `
        Mr. Müller
        Hauptstr. 5a
        80331 München
        `;
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(1);
        
        const found = matches[0][0];
        
        expect(found).toContain('Hauptstr. 5a');
        expect(found).toContain('80331 München');
    });

    it('should IGNORE simple numbers or text (False Positives)', () => {

        const text = "I have 3 apples in 1020 boxes.";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(0);

    });

});