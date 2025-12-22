/*
 * AIgis - ToonConverter
 * Uses the official 'toon-format' library.
 */
import { encode, decode } from '@toon-format/monorepo/packages/toon/src/index.ts'; 

export const ToonConverter = {

    convert(text) {
        const jsonBlockRegex = /(\{(?:[^{}]|(?:\{[^{}]*\}))*\})|(\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\])/g;

        return text.replace(jsonBlockRegex, (match) => {
            try {
                const jsonObj = JSON.parse(match);
                const toonOutput = encode(jsonObj); 

                return `\n\`\`\`text\nAIgis:TOON\n${toonOutput.trim()}\n\`\`\`\n`;
            } catch (e) {
                return match;
            }
        });
    },

    decodeRaw(rawString) {
        try {
            const clean = rawString.trim().replace(/```/g, '');
            const jsonObj = decode(clean);
            return JSON.stringify(jsonObj, null, 2);
        } catch (e) {
            return null;
        }
    },

    restore(text) {
        const toonBlockRegex = /```text\s+AIgis:TOON\s+([\s\S]*?)\s+```/gi;
        return text.replace(toonBlockRegex, (match, content) => {
            const res = this.decodeRaw(content);
            return res || match;
        });
    }
};