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

    it('should leave code with quoted brackets untouched without scanning it quadratically', () => {
        let code = '';
        for (let i = 0; i < 2000; i++) {
            code += `if (ch === '{') { depth++; buf.push('['); } const k${i} = map['k${i}'];\n`;
        }

        const started = performance.now();
        const converted = ToonConverter.convert(code);
        const elapsed = performance.now() - started;

        expect(converted).toBe(code);
        expect(elapsed).toBeLessThan(500);
    });

    it('should still convert JSON that starts after whitespace or a non-breaking space', () => {
        const converted = ToonConverter.convert('a { "nb": true} b [ {"x": 1} ] c');

        expect(converted.match(/AIgis:TOON/g)).toHaveLength(2);
        expect(converted).not.toContain('"nb"');
    });

    it('should leave citations, index access, scalar lists and empty containers untouched', () => {
        const samples = [
            'As shown in [1] and [2], the effect is small.',
            'const first = items[0].name;',
            'value = config["timeout"]',
            'def sizes():\n    return [12, 24, 48]',
            'if (list.length === 0) return [];',
            'defaults: {}'
        ];
        for (const sample of samples) {
            expect(ToonConverter.convert(sample), sample).toBe(sample);
        }
    });

    it('should still convert structured data (arrays of objects/arrays, non-empty objects)', () => {
        const converted = ToonConverter.convert('Users [{"id":1,"name":"Ana"},{"id":2,"name":"Ben"}] matrix [[1,2],[3,4]] config {"retries": 3}');

        expect(converted.match(/AIgis:TOON/g)).toHaveLength(3);
        expect(converted).not.toContain('"Ana"');
    });

});