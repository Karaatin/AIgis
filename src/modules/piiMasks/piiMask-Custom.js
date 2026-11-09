import { piiBaseMask } from './piiBaseMask.js';

// same step matchAll() takes after an empty match
function emptyMatchStep(text, index, unicode) {
    if (!unicode) return 1;
    const high = text.charCodeAt(index);
    const low = text.charCodeAt(index + 1);
    return high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF ? 2 : 1;
}

export default class CustomMask extends piiBaseMask {

    static MAX_CHUNK_SOURCE = 8000;

    /**
     * @param {string[]} customWords
     */
    constructor(customWords = []) {
        super('CUSTOM');

        this.words = customWords || [];
        this.regex = this.buildRegex();
    }

    /**
     * Compiles the word list into one alternation PER FLAG SET, so each
     * pattern's own flags (i, m, s, u) are respected. 'g' is always added
     * by the engine. Patterns without meaningful flags default to the
     * legacy case-insensitive behavior.
     * Large groups are split into chunks (see MAX_CHUNK_SOURCE).
     * @returns {RegExp[][]|null}
     */
    buildRegex() {
        if (!this.words || this.words.length === 0) {
            return null;
        }

        const ALLOWED_FLAGS = 'imsu';
        const sanitizeFlags = (raw) => {
            const kept = [...new Set((raw || '').split('').filter(c => ALLOWED_FLAGS.includes(c)))].sort().join('');
            return kept.length > 0 ? kept : 'i'; // default: case-insensitive
        };

        const groups = new Map();
        const addToGroup = (source, flags) => {
            if (!groups.has(flags)) groups.set(flags, new Set());
            groups.get(flags).add(source);
        };

        this.words.forEach(item => {

            if (item instanceof RegExp) {
                addToGroup(item.source, sanitizeFlags(item.flags));
                return;
            }

            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (trimmed.length === 0) return;

                const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/);
                if (regexMatch) {
                    addToGroup(regexMatch[1], sanitizeFlags(regexMatch[2]));
                    return;
                }

                const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const startsWithWordChar = /^\w/.test(trimmed);
                const startBoundary = startsWithWordChar ? '\\b' : '(?<!\\w)';
                const endsWithWordChar = /\w$/.test(trimmed);
                const endBoundary = endsWithWordChar ? '\\b' : '(?!\\w)';

                addToGroup(`${startBoundary}${escaped}${endBoundary}`, 'i');
            }
        });

        const groupRegexes = [];
        for (const [flags, sources] of groups) {
            const sorted = [...sources].sort((a, b) => b.length - a.length);

            // chunks keep the sorted order
            const chunks = [];
            let chunk = [];
            let chunkLength = 0;
            for (const source of sorted) {
                if (chunk.length > 0 && chunkLength + source.length > CustomMask.MAX_CHUNK_SOURCE) {
                    chunks.push(chunk);
                    chunk = [];
                    chunkLength = 0;
                }
                chunk.push(source);
                chunkLength += source.length + 1;
            }
            if (chunk.length > 0) chunks.push(chunk);

            const compiled = [];
            for (const part of chunks) {
                try {
                    compiled.push(new RegExp(`(${part.join('|')})`, 'g' + flags));
                } catch (e) {
                    // pre-validated input should never reach this; skip the chunk
                    // rather than breaking the entire custom mask
                }
            }
            if (compiled.length > 0) groupRegexes.push(compiled);
        }

        return groupRegexes.length > 0 ? groupRegexes : null;
    }

    find(text) {
        if (!this.regex) return [];
        const matches = [];
        for (const chunks of this.regex) {
            const found = chunks.length === 1 ? text.matchAll(chunks[0]) : this.findInChunks(text, chunks);
            // no spread, huge match lists can overflow the stack
            for (const match of found) matches.push(match);
        }
        return matches;
    }

    // merges the chunk matches exactly like one regex over all entries would match
    findInChunks(text, chunks) {
        const next = new Array(chunks.length).fill(undefined); // undefined = rescan, null = exhausted
        const found = [];
        let pos = 0;

        while (pos <= text.length) {
            let best = -1;
            for (let k = 0; k < chunks.length; k++) {
                if (next[k] === undefined || (next[k] !== null && next[k].index < pos)) {
                    chunks[k].lastIndex = pos;
                    next[k] = chunks[k].exec(text);
                }
                if (next[k] && (best < 0 || next[k].index < next[best].index)) best = k;
            }
            if (best < 0) break;

            const match = next[best];
            found.push(match);
            next[best] = undefined;
            pos = match.index + (match[0].length > 0
                ? match[0].length
                : emptyMatchStep(text, match.index, chunks[best].unicode));
        }
        return found;
    }

    updateWords(newWords) {
        this.words = newWords;
        this.regex = this.buildRegex();
    }
}