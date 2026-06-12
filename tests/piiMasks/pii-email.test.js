import { describe, it, expect } from 'vitest';
import EmailMask from '../../src/modules/piiMasks/piiMask-Email.js';
describe('PII Mask Logic: Email', () => {
    
    it('should find all valid emails in the sample text', () => {

        const mask = new EmailMask();
        const text = "Please contact john.smith@corporation.com or support-team+urgent@service.net, or my personal email jane.doe99@gmail.com.";
        
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
        
    it('should skip safe mock emails in developer mode but mask real ones', () => {

        const mask = new EmailMask();
        const text = "Emails: test@example.com, test@mydev.local, user@gmail.com";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(3);

        expect(mask.validate(matches[0][0], 'developer')).toBe(false); // test@example.com
        expect(mask.validate(matches[1][0], 'developer')).toBe(false); // developer@localhost
        expect(mask.validate(matches[2][0], 'developer')).toBe(true);  // user@gmail.com

        expect(mask.validate(matches[0][0], 'strict')).toBe(true);
        expect(mask.validate(matches[1][0], 'strict')).toBe(true);

    });

});