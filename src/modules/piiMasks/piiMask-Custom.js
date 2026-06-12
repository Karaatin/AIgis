import { piiBaseMask } from './piiBaseMask.js';

export default class CustomMask extends piiBaseMask {

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
     * @returns {RegExp[]|null}
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

        const regexes = [];
        for (const [flags, sources] of groups) {
            const sorted = [...sources].sort((a, b) => b.length - a.length);
            try {
                regexes.push(new RegExp(`(${sorted.join('|')})`, 'g' + flags));
            } catch (e) {
                // pre-validated input should never reach this; skip the group
                // rather than breaking the entire custom mask
            }
        }

        return regexes.length > 0 ? regexes : null;
    }

    find(text) {
        if (!this.regex) return [];
        const matches = [];
        for (const re of this.regex) {
            matches.push(...text.matchAll(re));
        }
        return matches;
    }

    updateWords(newWords) {
        this.words = newWords;
        this.regex = this.buildRegex();
    }
}