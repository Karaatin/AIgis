/*
 * AIgis - Pattern Validator
 * Generic safety pipeline for ALL dictionary patterns - the user's local
 * custom list and subscription feeds alike. One bad pattern must never
 * break the masking engine.
 *
 * Layers:
 *  1. compile check        - invalid regex is skipped, never thrown
 *  2. length cap           - patterns > 256 chars are rejected
 *  3. backtracking check   - nested quantifiers like (a+)+ are rejected (ReDoS heuristic)
 *  4. opt-in regex         - if allowRegex is false, regex-shaped entries are
 *                            dropped (inert): never executed, never matched
 *
 * Flags: i, m, s and u are respected per pattern ('g' is engine-managed).
 * Patterns without meaningful flags default to case-insensitive matching
 * (backward compatible).
 */
import { Logger } from '../utils/logger.js';

export const PatternValidator = {

    MAX_PATTERN_LENGTH: 256,
    ALLOWED_FLAGS: 'imsu',

    /**
     * Keeps only supported flags; empty result falls back to the legacy
     * case-insensitive default.
     */
    sanitizeFlags(rawFlags) {
        const kept = [...new Set((rawFlags || '').split('').filter(c => this.ALLOWED_FLAGS.includes(c)))].sort().join('');
        return kept.length > 0 ? kept : 'i';
    },

    /**
     * Validates a word list from any source.
     * @param {Array<string|RegExp>} words
     * @param {object} options - { allowRegex: boolean, sourceName?: string }
     * @returns {{ accepted: Array<string|RegExp>, rejected: Array<{pattern: string, reason: string}> }}
     *   accepted entries are directly consumable by CustomMask:
     *   plain strings (escaped by CustomMask) or pre-validated RegExp objects.
     */
    validateWords(words, { allowRegex = false, sourceName = 'list' } = {}) {
        const accepted = [];
        const rejected = [];

        for (const word of (words || [])) {
            if (typeof word !== 'string') continue;
            const trimmed = word.trim();
            if (trimmed.length === 0) continue;

            const regexShape = trimmed.match(/^\/(.+)\/([a-z]*)$/);

            if (!regexShape) {
                accepted.push(trimmed);
                continue;
            }

            if (!allowRegex) {
                continue;
            }

            const verdict = this.checkPattern(regexShape[1], regexShape[2]);
            if (verdict.ok) {
                accepted.push(verdict.regex);
            } else {
                rejected.push({ pattern: trimmed, reason: verdict.reason });
                Logger.warn(`${sourceName}: pattern rejected (${verdict.reason}): ${trimmed}`);
            }
        }

        return { accepted, rejected };
    },

    /**
     * Validates a single raw regex source string with optional flags.
     * @returns {{ok: true, regex: RegExp} | {ok: false, reason: string}}
     */
    checkPattern(source, rawFlags = '') {
        if (source.length > this.MAX_PATTERN_LENGTH) {
            return { ok: false, reason: `pattern exceeds ${this.MAX_PATTERN_LENGTH} chars` };
        }

        const flags = this.sanitizeFlags(rawFlags);

        let regex;
        try {
            regex = new RegExp(source, flags);
        } catch (e) {
            return { ok: false, reason: `compile error: ${e.message}` };
        }

        if (this.hasNestedQuantifiers(source)) {
            return { ok: false, reason: 'potential catastrophic backtracking (nested quantifiers)' };
        }

        return { ok: true, regex };
    },

    hasNestedQuantifiers(source) {
        const groupHasQuantifier = [];

        const isQuantifierAt = (i) => {
            const c = source[i];
            if (c === '*' || c === '+') return true;
            if (c === '{' && /^\{\d/.test(source.substring(i, i + 2))) return true;
            return false;
        };

        for (let i = 0; i < source.length; i++) {
            const c = source[i];

            if (c === '\\') { i++; continue; }

            if (c === '[') {
                i++;
                while (i < source.length && source[i] !== ']') {
                    if (source[i] === '\\') i++;
                    i++;
                }
                continue;
            }

            if (c === '(') {
                groupHasQuantifier.push(false);
                continue;
            }

            if (c === ')') {
                const inner = groupHasQuantifier.pop() || false;
                if (inner && isQuantifierAt(i + 1)) {
                    return true;
                }
                if (groupHasQuantifier.length > 0) {
                    groupHasQuantifier[groupHasQuantifier.length - 1] =
                        groupHasQuantifier[groupHasQuantifier.length - 1] || inner || isQuantifierAt(i + 1);
                }
                continue;
            }

            if (isQuantifierAt(i) && groupHasQuantifier.length > 0) {
                groupHasQuantifier[groupHasQuantifier.length - 1] = true;
            }
        }

        return false;
    }
};
