import { describe, it, expect } from 'vitest';
import { PatternValidator } from '../../src/modules/patternValidator.js';
import CustomMask from '../../src/modules/piiMasks/piiMask-Custom.js';

describe('Subscription Pattern Validator', () => {

    describe('allowRegex: true', () => {

        it('should accept valid regex patterns as RegExp objects', () => {
            const { accepted, rejected } = PatternValidator.validateWords(
                ['/\\b(?:CORP-SER-\\d+)\\b/i', 'PlainWord'],
                { allowRegex: true }
            );
            expect(rejected.length).toBe(0);
            expect(accepted.length).toBe(2);
            expect(accepted[0]).toBeInstanceOf(RegExp);
            expect(accepted[0].source).toBe('\\b(?:CORP-SER-\\d+)\\b');
            expect(accepted[1]).toBe('PlainWord');
        });

        it('should skip invalid regex without throwing', () => {
            const { accepted, rejected } = PatternValidator.validateWords(
                ['/[unclosed/i', '/valid\\d+/', 'word'],
                { allowRegex: true }
            );
            expect(rejected.length).toBe(1);
            expect(rejected[0].reason).toContain('compile error');
            expect(accepted.length).toBe(2);
        });

        it('should reject nested quantifiers (ReDoS shapes)', () => {
            const evil = ['/(a+)+$/', '/(a*)*b/', '/(\\d+){2,}/', '/((ab)+)+/'];
            for (const pattern of evil) {
                const { accepted, rejected } = PatternValidator.validateWords([pattern], { allowRegex: true });
                expect(rejected.length, `should reject ${pattern}`).toBe(1);
                expect(rejected[0].reason).toContain('backtracking');
                expect(accepted.length).toBe(0);
            }
        });

        it('should NOT reject safe patterns with inner quantifiers', () => {
            const safe = [
                '/\\b(?:CORP-SER-\\d+)\\b/',   // quantifier inside group, group not repeated
                '/(abc)+/',                     // repeated group without inner quantifier
                '/a+b*c{2,4}/',                 // sequential quantifiers
                '/(a+)?/',                      // optional group is single-pass
                '/[a+]*x/'                      // quantifier inside char class is a literal
            ];
            for (const pattern of safe) {
                const { rejected } = PatternValidator.validateWords([pattern], { allowRegex: true });
                expect(rejected.length, `should accept ${pattern}`).toBe(0);
            }
        });

        it('should reject overlong patterns', () => {
            const long = `/${'a'.repeat(PatternValidator.MAX_PATTERN_LENGTH + 1)}/`;
            const { rejected } = PatternValidator.validateWords([long], { allowRegex: true });
            expect(rejected.length).toBe(1);
            expect(rejected[0].reason).toContain('exceeds');
        });

    });

    describe('allowRegex: false (literal neutralization)', () => {

        it('should match regex-shaped entries as literal text including delimiters', () => {
            const { accepted, rejected } = PatternValidator.validateWords(
                ['/\\b(?:CORP-\\d+)\\b/i'],
                { allowRegex: false }
            );
            expect(rejected.length).toBe(0);
            expect(accepted[0]).toBeInstanceOf(RegExp);

            const re = new RegExp(accepted[0].source, 'gi');
            expect('see /\\b(?:CORP-\\d+)\\b/i here'.match(re)).not.toBeNull();
            // must NOT behave as the regex itself:
            expect(re.test('CORP-1234')).toBe(false);
        });

        it('should neutralize even ReDoS patterns to harmless literals', () => {
            const { accepted, rejected } = PatternValidator.validateWords(['/(a+)+$/'], { allowRegex: false });
            expect(rejected.length).toBe(0);
            const re = new RegExp(accepted[0].source, 'gi');
            expect(re.test('xx /(a+)+$/ xx')).toBe(true);
            expect(re.test('aaaaaaaaaaaaaaaaaaaaaaa!')).toBe(false);
        });

    });

    describe('CustomMask end-to-end integration', () => {

        it('should mask via validated subscription patterns merged with local words', () => {
            const { accepted } = PatternValidator.validateWords(
                ['/CORP-SER-\\d+/', 'ProjectApollo'],
                { allowRegex: true }
            );
            const mask = new CustomMask(['LocalSecret', ...accepted]);

            const text = 'Deploy CORP-SER-042 for ProjectApollo with LocalSecret.';
            const matches = Array.from(mask.find(text)).map(m => m[0]);

            expect(matches).toContain('CORP-SER-042');
            expect(matches).toContain('ProjectApollo');
            expect(matches).toContain('LocalSecret');
        });

        it('should never break the engine on a hostile feed (all entries rejected or neutralized)', () => {
            const hostile = ['/[broken/', '/(x+)+y/', ''];
            const { accepted, rejected } = PatternValidator.validateWords(hostile, { allowRegex: true });
            expect(rejected.length).toBe(2);

            // building a mask from the surviving (possibly empty) set must not throw
            const mask = new CustomMask(accepted);
            expect(Array.from(mask.find('any text')).length).toBe(0);
        });

    });

});
