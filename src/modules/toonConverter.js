/*
 * AIgis - ToonConverter
 * Uses the official 'toon-format' library.
 */
import { encode, decode } from '@toon-format/monorepo/packages/toon/src/index.ts';

const NOTE_PREFIX = "Note: Structured data below is optimized in TOON format (2-space indent, arrays show length and fields, tab-separated). If you generate structured tables or arrays in your response, use this same TOON format.";

export const ToonConverter = {

    convert(text) {
        if (!text) return text;

        let result = "";
        let lastEndIndex = 0;

        for (let i = 0; i < text.length; i++) {
            if (text[i] === '{' || text[i] === '[') {
                let depth = 0;
                let inString = false;
                let escapeNext = false;

                for (let j = i; j < text.length; j++) {
                    const char = text[j];
                    if (escapeNext) { escapeNext = false; continue; }
                    if (char === '\\') { escapeNext = true; continue; }
                    if (char === '"') { inString = !inString; continue; }

                    if (!inString) {
                        if (char === '{' || char === '[') depth++;
                        else if (char === '}' || char === ']') depth--;

                        if (depth === 0) {
                            const block = text.substring(i, j + 1);
                            try {
                                const cleanBlock = block.replace(/\u00A0/g, ' '); // strip non-breaking spaces
                                const jsonObj = JSON.parse(cleanBlock);
                                const toonOutput = encode(jsonObj, { delimiter: '\t' });
                                const toReplace = `\n${NOTE_PREFIX}\n\n\`\`\`toon\nAIgis:TOON\n${toonOutput.trim()}\n\`\`\`\n`;

                                result += text.substring(lastEndIndex, i);
                                result += toReplace;
                                lastEndIndex = j + 1;
                                i = j; // skip over parsed block
                            } catch (e) {
                                // not valid JSON, continue outer loop
                            }
                            break;
                        } else if (depth < 0) {
                            break; // mismatched brackets
                        }
                    }
                }
            }
        }

        result += text.substring(lastEndIndex);
        return result;
    },

    decodeRaw(rawString) {
        try {
            const clean = rawString.trim().replace(/```/g, '').trim();
            if (!clean) return null;
            const jsonObj = decode(clean);

            if (typeof jsonObj !== 'object' || jsonObj === null) return null;
            if (Object.keys(jsonObj).length === 0 && clean !== '_') return null;

            return JSON.stringify(jsonObj, null, 2);
        } catch (e) {
            return null;
        }
    },

    restore(text) {
        // escape special chars in NOTE_PREFIX for safe regex use
        const escapedPrefix = NOTE_PREFIX.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexStr = `(?:${escapedPrefix}\\s+)?\`\`\`(?:text|toon|yaml)\\s+AIgis:TOON\\s+([\\s\\S]*?)\\s+\`\`\``;
        const toonBlockRegex = new RegExp(regexStr, "gi");

        return text.replace(toonBlockRegex, (match, content) => {
            const res = this.decodeRaw(content);
            return res || match;
        });
    }
};