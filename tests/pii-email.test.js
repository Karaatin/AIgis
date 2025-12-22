import { describe, it, expect } from 'vitest';
import EmailMask from '../src/modules/piiMasks/piiMask-Email.js';
import { samplePrompts } from './testData.js';

describe('PII Mask Logic: Email', () => {
    
    it('should find all valid emails in the sample text', () => {

        const mask = new EmailMask();
        const text = samplePrompts.emailScenario;
        
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(3);

        const foundEmails = matches.map(m => m[0]);
        expect(foundEmails).toContain('john.smith@corporation.com');
        expect(foundEmails).toContain('support-team+urgent@service.net');
        expect(foundEmails).toContain('jane.doe99@gmail.com');

    });

    it('should NOT find false positives', () => {

        const mask = new EmailMask();
        const text = "Look at @twitter_handle and buy 50 items @ $10.";

        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(0);
        
    });

});