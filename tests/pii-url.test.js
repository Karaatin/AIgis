import { describe, it, expect } from 'vitest';
import URLMask from '../src/modules/piiMasks/piiMask-URL.js';

describe('PII Mask Logic: URL', () => {
    
    const mask = new URLMask();

    it('should detect standard URLs', () => {

        const text = "Visit https://google.com";
        const matches = Array.from(mask.find(text));
        expect(matches[0][0]).toBe('https://google.com');

    });

    it('should NOT capture trailing punctuation (Cleaning)', () => {

        const text1 = "Go to google.com."; 
        const matches1 = Array.from(mask.find(text1));
        expect(matches1.length).toBe(1);
        expect(matches1[0][0]).toBe('google.com');

        const text2 = "Check mysite.com/foo.";
        const matches2 = Array.from(mask.find(text2));
        expect(matches2[0][0]).toBe('mysite.com/foo');

        const text3 = "Check mysite.com/v2.0/api";
        const matches3 = Array.from(mask.find(text3));
        expect(matches3[0][0]).toBe('mysite.com/v2.0/api');

    });

    it('should detect Tech TLDs without http (naked)', () => {

        const text = "Check my startup at super-ai.ai or code.io or app.dev";
        const matches = Array.from(mask.find(text));
        expect(matches.length).toBe(3);

    });

    it('should detect Country TLDs', () => {

        const text = "Here is amazon.de and news.ch";
        const matches = Array.from(mask.find(text));
        expect(matches[0][0]).toBe('amazon.de');
        expect(matches[1][0]).toBe('news.ch');
        
    });

    it('should IGNORE unknown extensions (files)', () => {

        const text = "Look at image.png and virus.exe or document.pdf";
        const matches = Array.from(mask.find(text));
        expect(matches.length).toBe(0);

    });
    
    it('should detect complex URLs with query params', () => {

         const text = "Go to shop.xyz/products?id=123";
         const matches = Array.from(mask.find(text));
         expect(matches[0][0]).toBe('shop.xyz/products?id=123');

    });

    describe('Mode: Strict vs Developer', () => {

        it('should FIND localhost in Strict Mode but IGNORE in Developer Mode', () => {
            
            const text = "Check http://localhost:3000/api and http://127.0.0.1";
            
            const strictMatches = Array.from(mask.find(text, 'strict'));
            expect(strictMatches.length).toBe(2);

            const devMatches = Array.from(mask.find(text, 'developer'));
            expect(devMatches.length).toBe(0);

        });

        it('should DIFFERENTIATE between Files and URLs', () => {

            const text = "Run script.py or visit http://site.py";
            
            const strictMatches = Array.from(mask.find(text, 'strict'));
            expect(strictMatches.length).toBe(2);

            const devMatches = Array.from(mask.find(text, 'developer'));
            expect(devMatches.length).toBe(1);
            expect(devMatches[0][0]).toBe('http://site.py');

        });

        it('should ALWAYS FIND public URLs', () => {

            const text = "Go to https://google.com";
            
            const strictMatches = Array.from(mask.find(text, 'strict'));
            expect(strictMatches.length).toBe(1);

            const devMatches = Array.from(mask.find(text, 'developer'));
            expect(devMatches.length).toBe(1);

        });

    });

});