import { describe, it, expect, vi, afterEach } from 'vitest';
import { StorageManager } from '../../src/utils/storage.js';
import { SubscriptionSchema } from '../../src/modules/subscriptions/subscriptionSchema.js';

describe('Subscriptions: Settings Overlay', () => {

    const BASE = {
        settings: { enabled: true, debugMode: false, usageProfile: 'developer', peekMode: false, vaultPruneDays: 30 },
        modules: { email: true, secret: false, toon: true },
        customWords: ['LocalWord']
    };

    const CONFIG = { settings: { usageProfile: 'strict' }, modules: { secret: true } };

    async function mockEnv({ provider = {}, cache = {}, accepted = true } = {}) {
        const hash = await SubscriptionSchema.hashConfig(CONFIG);
        const sub = StorageManager._normalizeSubscription({
            id: 'sub1',
            name: 'Corp Rules',
            url: 'https://rules.example-corp.com/feed.json',
            enabled: true,
            applyConfig: true,
            acceptedConfigHash: accepted ? hash : 'stale-hash',
            ...provider
        });
        vi.spyOn(StorageManager, 'getSettings').mockResolvedValue(JSON.parse(JSON.stringify(BASE)));
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([sub]);
        vi.spyOn(StorageManager, 'getSubscriptionData').mockResolvedValue(
            cache === null ? {} : { sub1: { customWords: ['FeedWord'], config: CONFIG, fetchedAt: Date.now(), ...cache } }
        );
        return sub;
    }

    afterEach(() => vi.restoreAllMocks());

    it('should apply accepted overrides on top of base settings', async () => {
        await mockEnv();
        const eff = await StorageManager.getEffectiveSettings();

        expect(eff.settings.usageProfile).toBe('strict');   // overridden
        expect(eff.modules.secret).toBe(true);              // overridden
        expect(eff.settings.vaultPruneDays).toBe(30);       // untouched
        expect(eff.modules.email).toBe(true);               // untouched
        expect(eff.customWords).toEqual(['LocalWord']);     // never overridden

        expect(eff.overrides).not.toBeNull();
        expect(eff.overrides.providerId).toBe('sub1');
        expect(eff.overrides.providerHost).toBe('rules.example-corp.com');
    });

    it('should NOT apply overrides when the config is unconfirmed (hash mismatch)', async () => {
        await mockEnv({ accepted: false });
        const eff = await StorageManager.getEffectiveSettings();

        expect(eff.settings.usageProfile).toBe('developer');
        expect(eff.modules.secret).toBe(false);
        expect(eff.overrides).toBeNull();
    });

    it('should NOT apply overrides while subscriptions are globally paused', async () => {
        await mockEnv();
        const base = JSON.parse(JSON.stringify(BASE));
        base.settings.subscriptionsEnabled = false;
        StorageManager.getSettings.mockResolvedValue(base);

        const eff = await StorageManager.getEffectiveSettings();
        expect(eff.settings.usageProfile).toBe('developer');
        expect(eff.overrides).toBeNull();
    });

    it('should NOT apply overrides when the subscription is disabled', async () => {
        await mockEnv({ provider: { enabled: false } });
        const eff = await StorageManager.getEffectiveSettings();
        expect(eff.settings.usageProfile).toBe('developer');
        expect(eff.overrides).toBeNull();
    });

    it('should NOT apply overrides when applyConfig is off', async () => {
        await mockEnv({ provider: { applyConfig: false } });
        const eff = await StorageManager.getEffectiveSettings();
        expect(eff.overrides).toBeNull();
    });

    it('should NOT apply overrides without a cached payload (new device cold start)', async () => {
        await mockEnv({ cache: null });
        const eff = await StorageManager.getEffectiveSettings();
        expect(eff.settings.usageProfile).toBe('developer');
        expect(eff.overrides).toBeNull();
    });

    it('should leave base settings untouched after provider removal (overlay, not overwrite)', async () => {
        await mockEnv();
        await StorageManager.getEffectiveSettings();

        StorageManager.getSubscriptions.mockResolvedValue([]);
        const eff = await StorageManager.getEffectiveSettings();
        expect(eff.settings.usageProfile).toBe('developer');
        expect(eff.modules.secret).toBe(false);
        expect(eff.overrides).toBeNull();
    });

});

describe('Subscriptions: CRUD guards', () => {

    afterEach(() => vi.restoreAllMocks());

    it('should reject non-HTTPS subscription URLs', async () => {
        const res = await StorageManager.addSubscription({ url: 'http://rules.corp.com/feed.json' });
        expect(res.error).toContain('HTTPS');

        const res2 = await StorageManager.addSubscription({ url: 'ftp://rules.corp.com/feed.json' });
        expect(res2.error).toBeDefined();
    });

    it('should reject duplicate subscription URLs', async () => {
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([
            StorageManager._normalizeSubscription({ id: 'x', url: 'https://a.com/f.json' })
        ]);
        const res = await StorageManager.addSubscription({ url: 'https://a.com/f.json' });
        expect(res.error).toContain('already');
    });

    it('should generate the id locally and normalize defaults', async () => {
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([]);
        vi.spyOn(StorageManager, 'saveSubscriptions').mockResolvedValue({});

        const res = await StorageManager.addSubscription({ url: 'https://a.com/f.json' });
        expect(res.subscription.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(res.subscription.enabled).toBe(true);
        expect(res.subscription.applyConfig).toBe(false);
        expect(res.subscription.allowRegex).toBe(false);
        expect(res.subscription.lastStatus).toBe('pending');
    });

    it('should import subscriptions with consent flags stripped, deduped and HTTPS-only', async () => {
        let saved = null;
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([
            StorageManager._normalizeSubscription({ id: 'x', url: 'https://existing.com/f.json' })
        ]);
        vi.spyOn(StorageManager, 'saveSubscriptions').mockImplementation(async (l) => { saved = l; return {}; });

        const added = await StorageManager.importSubscriptions([
            { url: 'https://existing.com/f.json', enabled: true },              // dupe -> skipped
            { url: 'http://insecure.com/f.json', enabled: true },               // http -> skipped
            {
                url: 'https://new.com/f.json', enabled: false,
                applyConfig: true, acceptedConfigHash: 'evil', allowRegex: true
            } // consent flags must be stripped
        ]);

        expect(added).toBe(1);
        expect(saved.length).toBe(2);
        const imported = saved.find(s => s.url === 'https://new.com/f.json');
        expect(imported.enabled).toBe(false);          // enabled state respected
        expect(imported.applyConfig).toBe(false);      // consent NOT importable
        expect(imported.acceptedConfigHash).toBe(null);
        expect(imported.allowRegex).toBe(false);       // trust NOT importable
        expect(imported.id).toMatch(/^[0-9a-f-]{36}$/); // locally generated
    });

    it('should merge feed words into local list when removing with importWords', async () => {
        const saved = {};
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([
            StorageManager._normalizeSubscription({ id: 'sub1', url: 'https://a.com/f.json' })
        ]);
        vi.spyOn(StorageManager, 'getSubscriptionData').mockResolvedValue({
            sub1: { customWords: ['FeedWord', 'LocalWord'], config: null, fetchedAt: 1 }
        });
        vi.spyOn(StorageManager, 'getSettings').mockResolvedValue({
            settings: {}, modules: {}, customWords: ['LocalWord']
        });
        vi.spyOn(StorageManager, 'saveSettings').mockImplementation(async (s) => { saved.settings = s; });
        vi.spyOn(StorageManager, 'saveSubscriptionData').mockImplementation(async (d) => { saved.data = d; });
        vi.spyOn(StorageManager, 'saveSubscriptions').mockImplementation(async (l) => { saved.subs = l; });

        await StorageManager.removeSubscription('sub1', { importWords: true });

        expect(saved.settings.customWords).toEqual(['LocalWord', 'FeedWord']); // deduped merge
        expect(saved.data.sub1).toBeUndefined();
        expect(saved.subs).toEqual([]);
    });

    it('should drop cached words when removing without importWords', async () => {
        const saved = {};
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([
            StorageManager._normalizeSubscription({ id: 'sub1', url: 'https://a.com/f.json' })
        ]);
        vi.spyOn(StorageManager, 'getSubscriptionData').mockResolvedValue({
            sub1: { customWords: ['FeedWord'], config: null, fetchedAt: 1 }
        });
        const saveSettings = vi.spyOn(StorageManager, 'saveSettings').mockResolvedValue();
        vi.spyOn(StorageManager, 'saveSubscriptionData').mockImplementation(async (d) => { saved.data = d; });
        vi.spyOn(StorageManager, 'saveSubscriptions').mockImplementation(async (l) => { saved.subs = l; });

        await StorageManager.removeSubscription('sub1');

        expect(saveSettings).not.toHaveBeenCalled();
        expect(saved.data.sub1).toBeUndefined();
    });

});
