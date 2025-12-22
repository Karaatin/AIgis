import { describe, it, expect } from 'vitest';
import PathMask from '../src/modules/piiMasks/piiMask-Path.js';

describe('PII Mask Logic: File Paths', () => {
    
    const mask = new PathMask();

    it('should detect Windows paths', () => {

        const text = "Logs are at C:\\Users\\Admin\\secret.log and D:\\Data\\Backup";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('C:\\Users\\Admin\\secret.log');
        expect(matches[1][0]).toBe('D:\\Data\\Backup');

    });

    it('should detect Windows paths (relative)', () => {

        const text = "Check Logs\\Error.txt and ..\\Config\\setup.bat";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('Logs\\Error.txt');
        expect(matches[1][0]).toBe('..\\Config\\setup.bat');

    });

    it('should detect Windows paths with dot-slash', () => {

        const text = "Run .\\install.exe please";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(1);
        expect(matches[0][0]).toBe('.\\install.exe');

    });

    it('should detect Unix/Linux paths', () => {

        const text = "Check config at /etc/nginx/nginx.conf or /home/user/.ssh/id_rsa";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('/etc/nginx/nginx.conf');
        expect(matches[1][0]).toBe('/home/user/.ssh/id_rsa');

    });

    it('should detect RELATIVE Unix paths (deep structure)', () => {

        const text = "Run cd var/log/apache2 or check src/modules/utils.js";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(2);
        expect(matches[0][0]).toBe('var/log/apache2');
        expect(matches[1][0]).toBe('src/modules/utils.js');

    });

    it('should IGNORE URLs (False Positives)', () => {

        const text = "Go to https://google.com/search/results or https://google.com/search or maybe http://site.co/a/b";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(0);

    });

    it('should IGNORE Dates looks like paths', () => {

        const text = "Date: 10/12/2023 or 2023/01/01";
        const matches = Array.from(mask.find(text));
        
        if (matches.length > 0) {
             expect(mask.validate(matches[0][0])).toBe(false);
        } else {
            expect(matches.length).toBe(0);
        }

    });

    it('should IGNORE short relative fragments (false positives)', () => {

        const text = "This is a test and/or an example for km/h.";
        const matches = Array.from(mask.find(text));
        
        expect(matches.length).toBe(0); 

    });

    it('should IGNORE Dates even if they look like relative paths', () => {

        const text = "Date: 10/12/2024";
        const matches = Array.from(mask.find(text));
        
        if (matches.length > 0) {
            expect(mask.validate(matches[0][0])).toBe(false);
        } else {
            expect(matches.length).toBe(0);
        }

    });


});