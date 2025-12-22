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

        const uniqueWords = [...new Set(this.words)].filter(w => w && w.trim().length > 0);

        if (uniqueWords.length === 0) return null;

        uniqueWords.sort((a, b) => b.length - a.length);

        const patterns = uniqueWords.map(word => {

            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const startsWithWordChar = /^\w/.test(word);
            const startBoundary = startsWithWordChar ? '\\b' : '(?<!\\w)';

            const endsWithWordChar = /\w$/.test(word);
            const endBoundary = endsWithWordChar ? '\\b' : '(?!\\w)';

            return `${startBoundary}${escaped}${endBoundary}`;
        });

        return new RegExp(`(${patterns.join('|')})`, 'gi');
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