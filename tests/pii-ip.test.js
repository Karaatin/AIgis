import { describe, it, expect } from 'vitest';
import IPMask from '../src/modules/piiMasks/piiMask-IP.js';

describe('PII Mask Logic: IP Address', () => {

    const mask = new IPMask();

    it('should detect valid IPv4 addresses', () => {

        const text = "Server is at 192.168.1.1 and backup at 10.0.0.255";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('192.168.1.1');
        expect(matches[1][0]).toBe('10.0.0.255');

    });

    it('should detect valid IPv6 addresses', () => {

        const text = "IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');

    });

    it('should detect compressed IPv6 addresses (::)', () => {

        const text = "Localhost is ::1 or just ::";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('::1');
        expect(matches[1][0]).toBe('::');

    });

    it('should IGNORE invalid IPv4 (out of range)', () => {

        const text = "Not an IP: 256.0.0.1 or 999.999.999.999";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(0);

    });

    it('should IGNORE version numbers', () => {

        const text = "Version 4.5.6 released";
        const matches = Array.from(mask.find(text));

        expect(matches.length).toBe(0);

    });

    describe('Mode: Strict vs Developer', () => {

        it('should FIND private IPs in Strict Mode but IGNORE in Developer Mode', () => {

            const text = "IPs: 192.168.1.1, 10.0.0.5, 127.0.0.1";

            const strictMatches = Array.from(mask.find(text, 'strict'));
            expect(strictMatches.length).toBe(3);

            const devMatches = Array.from(mask.find(text, 'developer'));
            expect(devMatches.length).toBe(0);

        });

        it('should ALWAYS FIND public IPs', () => {

            const text = "DNS is 8.8.8.8";

            const strictMatches = Array.from(mask.find(text, 'strict'));
            expect(strictMatches.length).toBe(1);

            const devMatches = Array.from(mask.find(text, 'developer'));
            expect(devMatches.length).toBe(1);

        });
        
    });

});