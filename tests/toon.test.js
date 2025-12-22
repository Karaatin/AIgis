import { describe, it, expect } from 'vitest';
import { ToonConverter } from '../src/modules/toonConverter.js';

describe('ToonConverter (Official Repo)', () => {

    it('should convert JSON to TOON using Markdown blocks', () => {

        const input = 'Data: {"user": "Alice", "role": "Admin"}';
        const output = ToonConverter.convert(input);

        expect(output).toContain('```toon');
        expect(output).toContain('user: Alice'); 
        expect(output).not.toContain('{"user":');

    });

    it('should Round-Trip using official decode() from Markdown', () => {

        const originalJson = {
            id: 123,
            tags: ["dev", "prod"]
        };
        const input = `Config: ${JSON.stringify(originalJson)}`;
        
        const converted = ToonConverter.convert(input);
        expect(converted).toContain('```toon');
        
        const restored = ToonConverter.restore(converted);

        expect(restored).toContain('"id": 123');
        expect(restored).toContain('"dev"');
        expect(restored).not.toContain('```toon');

    });

});