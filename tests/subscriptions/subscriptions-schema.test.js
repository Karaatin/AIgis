import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SubscriptionSchema } from '../../src/modules/subscriptions/subscriptionSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const validFeed = () => ({
    schemaVersion: 1,
    name: 'Test Feed',
    description: 'A feed',
    customWords: ['SecretWord', '/CORP-\\d+/i'],
    config: { settings: { usageProfile: 'strict' }, modules: { secret: true } }
});

describe('Subscription Schema', () => {

    it('should parse a valid feed', () => {
        const res = SubscriptionSchema.parse(JSON.stringify(validFeed()));
        expect(res.ok).toBe(true);
        expect(res.feed.name).toBe('Test Feed');
        expect(res.feed.customWords).toEqual(['SecretWord', '/CORP-\\d+/i']);
        expect(res.feed.config.settings.usageProfile).toBe('strict');
        expect(res.feed.config.modules.secret).toBe(true);
    });

    it('should validate the repository sample feed', () => {
        const raw = readFileSync(join(__dirname, '../../subscription-sample.json'), 'utf-8');
        const res = SubscriptionSchema.parse(raw);
        expect(res.ok).toBe(true);
        expect(res.feed.customWords.length).toBe(2);
        expect(res.feed.config.settings.usageProfile).toBe('strict');
    });

    it('should reject invalid JSON, empty and oversized payloads', () => {
        expect(SubscriptionSchema.parse('{ nope').ok).toBe(false);
        expect(SubscriptionSchema.parse('').ok).toBe(false);
        expect(SubscriptionSchema.parse('x'.repeat(SubscriptionSchema.MAX_PAYLOAD_BYTES + 1)).ok).toBe(false);
        expect(SubscriptionSchema.parse('[1,2]').ok).toBe(false);
    });

    it('should reject unsupported schema versions with an update hint', () => {
        const feed = { ...validFeed(), schemaVersion: 2 };
        const res = SubscriptionSchema.parse(JSON.stringify(feed));
        expect(res.ok).toBe(false);
        expect(res.error).toContain('update AIgis');

        expect(SubscriptionSchema.parse(JSON.stringify({ ...validFeed(), schemaVersion: 0 })).ok).toBe(false);
        const noVersion = validFeed();
        delete noVersion.schemaVersion;
        expect(SubscriptionSchema.parse(JSON.stringify(noVersion)).ok).toBe(false);
    });

    it('should require a name', () => {
        const feed = validFeed();
        delete feed.name;
        expect(SubscriptionSchema.parse(JSON.stringify(feed)).ok).toBe(false);
        expect(SubscriptionSchema.parse(JSON.stringify({ ...validFeed(), name: '  ' })).ok).toBe(false);
    });

    it('should ignore unknown fields (forward compatibility)', () => {
        const feed = { ...validFeed(), futureFeature: { x: 1 }, anotherThing: 'yes' };
        const res = SubscriptionSchema.parse(JSON.stringify(feed));
        expect(res.ok).toBe(true);
        expect(res.feed.futureFeature).toBeUndefined();
    });

    it('should whitelist config keys and drop unknown or mistyped ones', () => {
        const feed = validFeed();
        feed.config = {
            settings: {
                usageProfile: 'strict',
                debugMode: 'yes',          // wrong type -> dropped
                maliciousKey: true,        // unknown -> dropped
                vaultPruneDays: 9999       // out of range -> dropped
            },
            modules: { secret: false, notAModule: true },
            injection: { evil: true }      // unknown block -> dropped
        };
        const res = SubscriptionSchema.parse(JSON.stringify(feed));
        expect(res.ok).toBe(true);
        expect(res.feed.config.settings).toEqual({ usageProfile: 'strict' });
        expect(res.feed.config.modules).toEqual({ secret: false });
        expect(res.feed.config.injection).toBeUndefined();
    });

    it('should sanitize words: trim, drop non-strings, enforce caps', () => {
        const feed = validFeed();
        feed.customWords = ['  ok  ', '', 42, null, 'x'.repeat(SubscriptionSchema.MAX_WORD_LENGTH + 1)];
        const res = SubscriptionSchema.parse(JSON.stringify(feed));
        expect(res.ok).toBe(true);
        expect(res.feed.customWords).toEqual(['ok']);
    });

    it('should reject feeds with too many words', () => {
        const feed = validFeed();
        feed.customWords = Array(SubscriptionSchema.MAX_WORDS + 1).fill('w');
        expect(SubscriptionSchema.parse(JSON.stringify(feed)).ok).toBe(false);
    });

    it('should cap name and description lengths', () => {
        const feed = validFeed();
        feed.name = 'N'.repeat(200);
        feed.description = 'D'.repeat(1000);
        const res = SubscriptionSchema.parse(JSON.stringify(feed));
        expect(res.feed.name.length).toBe(SubscriptionSchema.MAX_NAME_LENGTH);
        expect(res.feed.description.length).toBe(SubscriptionSchema.MAX_DESCRIPTION_LENGTH);
    });

    it('should produce stable config hashes independent of key order', async () => {
        const a = await SubscriptionSchema.hashConfig({ settings: { peekMode: true, debugMode: false }, modules: { secret: true } });
        const b = await SubscriptionSchema.hashConfig({ modules: { secret: true }, settings: { debugMode: false, peekMode: true } });
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);

        const c = await SubscriptionSchema.hashConfig({ settings: { peekMode: false } });
        expect(c).not.toBe(a);

        expect(await SubscriptionSchema.hashConfig(null)).toBe(null);
        expect(await SubscriptionSchema.hashConfig({})).toBe(null);
    });

});
