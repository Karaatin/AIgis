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

    buildRegex() {
        if (!this.words || this.words.length === 0) {
            return null;
        }

        const patterns = this.words.map(item => {
            
            if (item instanceof RegExp) {
                return item.source;
            }

            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (trimmed.length === 0) return null;

                const regexMatch = trimmed.match(/^\/(.+)\/[a-z]*$/);
                if (regexMatch) {
                    return regexMatch[1];
                }

                const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const startsWithWordChar = /^\w/.test(trimmed);
                const startBoundary = startsWithWordChar ? '\\b' : '(?<!\\w)';
                const endsWithWordChar = /\w$/.test(trimmed);
                const endBoundary = endsWithWordChar ? '\\b' : '(?!\\w)';

                return `${startBoundary}${escaped}${endBoundary}`;
            }

            return null;
        }).filter(Boolean);

        const uniquePatterns = [...new Set(patterns)];

        if (uniquePatterns.length === 0) return null;

        uniquePatterns.sort((a, b) => b.length - a.length);

        return new RegExp(`(${uniquePatterns.join('|')})`, 'gi');
    }

    find(text) {
        if (!this.regex) return [];
        return text.matchAll(this.regex);
    }

    updateWords(newWords) {
        this.words = newWords;
        this.regex = this.buildRegex();
    }
}