import { describe, it, expect } from 'vitest';
import { ToonConverter } from '../../src/modules/toonConverter.js';

describe('ToonConverter (Official Repo)', () => {

    it('should convert JSON to TOON using Markdown blocks', () => {

        const input = 'Data: {"user": "Alice", "role": "Admin"}';
        const output = ToonConverter.convert(input);

        expect(output).toContain('AIgis:TOON');
        expect(output).toContain('user: Alice'); 
        expect(output).not.toContain('{"user":');

    });

    it('should use tab delimiters and prepend instruction note for JSON arrays', () => {
        const input = '[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]';
        const output = ToonConverter.convert(input);
        
        expect(output).toContain('Note: Structured data below is optimized in TOON format');
        expect(output).toContain('id\tname');
        expect(output).toContain('1\tAlice');
        expect(output).toContain('2\tBob');
    });

    it('should Round-Trip using official decode() from Markdown', () => {

        const originalJson = {
            id: 123,
            tags: ["dev", "prod"]
        };
        const input = `Config: ${JSON.stringify(originalJson)}`;
        
        const converted = ToonConverter.convert(input);
        expect(converted).toContain('AIgis:TOON');
        
        const restored = ToonConverter.restore(converted);

        expect(restored).toContain('"id": 123');
        expect(restored).toContain('"dev"');
        expect(restored).not.toContain('AIgis:TOON');

    });

    it('should parse deeply nested JSON objects and arrays via depth-parser', () => {

        const deepJson = {
            level1: {
                level2: [
                    { level3: "deep" }
                ],
                other: { val: 42 }
            }
        };
        const input = `Here is nested JSON: ${JSON.stringify(deepJson)} !!`;
        
        const converted = ToonConverter.convert(input);
        expect(converted).toContain('AIgis:TOON');
        expect(converted).toContain('deep');
        expect(converted).not.toContain('{"level1"');

    });

});