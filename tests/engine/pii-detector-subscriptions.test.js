import { describe, it, expect, vi, afterEach } from 'vitest';
import { PiiDetector } from '../../src/modules/piiDetector.js';
import { StorageManager } from '../../src/utils/storage.js';

describe('PiiDetector: Subscription integration', () => {

    function mockEnv({ subscriptions = [], cache = {}, customWords = [], overrides = null, modules = {}, settings = {} } = {}) {
        vi.spyOn(StorageManager, 'getEffectiveSettings').mockResolvedValue({
            settings: { ...StorageManager.defaults.settings, ...settings },
            modules: { ...StorageManager.defaults.modules, ...modules },
            customWords,
            overrides
        });
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue(
            subscriptions.map(s => StorageManager._normalizeSubscription(s))
        );
        vi.spyOn(StorageManager, 'getSubscriptionData').mockResolvedValue(cache);
        vi.spyOn(StorageManager, 'getVault').mockResolvedValue({ mappings: {}, reverseIndex: {}, counters: {} });
        vi.spyOn(StorageManager, 'saveVault').mockResolvedValue();
    }

    afterEach(() => vi.restoreAllMocks());

    it('should mask local words and subscription words together', async () => {
        mockEnv({
            customWords: ['LocalSecret'],
            subscriptions: [{ id: 's1', name: 'Corp', url: 'https://a.com/f.json', enabled: true, allowRegex: true }],
            cache: { s1: { customWords: ['ProjectApollo', '/CORP-SER-\\d+/'], config: null, fetchedAt: 1 } }
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('LocalSecret meets ProjectApollo on CORP-SER-042.');

        expect(res.sanitizedText).not.toContain('LocalSecret');
        expect(res.sanitizedText).not.toContain('ProjectApollo');
        expect(res.sanitizedText).not.toContain('CORP-SER-042');
        expect(res.piiCounts.CUSTOM).toBe(3);
    });

    it('should ignore disabled subscriptions and uncached feeds', async () => {
        mockEnv({
            subscriptions: [
                { id: 'off', name: 'Off', url: 'https://a.com/f.json', enabled: false },
                { id: 'nocache', name: 'NoCache', url: 'https://b.com/f.json', enabled: true }
            ],
            cache: { off: { customWords: ['DisabledWord'], config: null, fetchedAt: 1 } }
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('DisabledWord stays visible.');

        expect(res.sanitizedText).toContain('DisabledWord');
    });

    it('should leave feed regex entries inert when allowRegex is off', async () => {
        mockEnv({
            subscriptions: [{ id: 's1', name: 'Corp', url: 'https://a.com/f.json', enabled: true, allowRegex: false }],
            cache: { s1: { customWords: ['/CORP-\\d+/'], config: null, fetchedAt: 1 } }
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('Reference CORP-1234 stays in the text.');

        expect(res.sanitizedText).toContain('CORP-1234');
        expect(res.piiCounts.CUSTOM).toBeUndefined();
    });

    it('should load no feed words while subscriptions are globally paused (local words still work)', async () => {
        mockEnv({
            customWords: ['LocalSecret'],
            settings: { subscriptionsEnabled: false },
            subscriptions: [{ id: 's1', name: 'Corp', url: 'https://a.com/f.json', enabled: true }],
            cache: { s1: { customWords: ['FeedWord'], config: null, fetchedAt: 1 } }
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('LocalSecret and FeedWord here.');

        expect(res.sanitizedText).not.toContain('LocalSecret');
        expect(res.sanitizedText).toContain('FeedWord');
    });

    it('should survive invalid LOCAL regex entries without losing other custom words', async () => {
        mockEnv({
            customWords: ['/[broken/', '/(a+)+evil/', 'StillWorks', '/EMP-\\d{4}/'],
            subscriptions: [],
            cache: {}
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('StillWorks with EMP-1234 despite broken entries.');

        expect(res.sanitizedText).not.toContain('StillWorks');
        expect(res.sanitizedText).not.toContain('EMP-1234');
        expect(res.piiCounts.CUSTOM).toBe(2);
    });

    it('should respect per-pattern flags from local entries (case-sensitive /Foo/m)', async () => {
        mockEnv({ customWords: ['/Codename/m'], subscriptions: [], cache: {} });

        const detector = new PiiDetector();
        const res = await detector.sanitize('Codename stays hidden, codename does not.');

        expect(res.sanitizedText).not.toContain('Codename');
        expect(res.sanitizedText).toContain('codename');
    });

    it('should respect a custom-module override from the effective settings', async () => {
        mockEnv({
            customWords: ['LocalSecret'],
            modules: { custom: false },
            subscriptions: [{ id: 's1', name: 'Corp', url: 'https://a.com/f.json', enabled: true }],
            cache: { s1: { customWords: ['FeedWord'], config: null, fetchedAt: 1 } }
        });

        const detector = new PiiDetector();
        const res = await detector.sanitize('LocalSecret and FeedWord untouched.');

        expect(res.sanitizedText).toContain('LocalSecret');
        expect(res.sanitizedText).toContain('FeedWord');
    });

});
