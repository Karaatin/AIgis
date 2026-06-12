import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SubscriptionSync } from '../../src/modules/subscriptions/subscriptionSync.js';
import { SubscriptionSchema } from '../../src/modules/subscriptions/subscriptionSchema.js';
import { StorageManager } from '../../src/utils/storage.js';

describe('Subscription Sync Engine', () => {

    const FEED = {
        schemaVersion: 1,
        name: 'Corp Rules',
        description: 'desc',
        customWords: ['SecretWord', '/(a+)+evil/'],
        config: { settings: { usageProfile: 'strict' } }
    };

    const sub = (over = {}) => StorageManager._normalizeSubscription({
        id: 'sub1', name: 'Corp Rules', url: 'https://rules.corp.com/feed.json',
        enabled: true, ...over
    });

    const okResponse = (over = {}) => ({
        status: 200,
        ok: true,
        url: 'https://rules.corp.com/feed.json',
        headers: { get: (h) => (h === 'etag' ? '"v1"' : null) },
        text: async () => JSON.stringify(FEED),
        ...over
    });

    let saved;

    beforeEach(() => {
        saved = { data: null, patches: [], syncState: {} };
        vi.spyOn(StorageManager, 'getSubscriptionData').mockImplementation(async () => saved.data ? { ...saved.data } : {});
        vi.spyOn(StorageManager, 'saveSubscriptionData').mockImplementation(async (d) => { saved.data = d; });
        vi.spyOn(StorageManager, 'updateSubscription').mockImplementation(async (id, patch) => { saved.patches.push(patch); });
        vi.spyOn(SubscriptionSync, 'getSyncState').mockImplementation(async () => saved.syncState);
        vi.spyOn(SubscriptionSync, 'saveSyncState').mockImplementation(async (s) => { saved.syncState = s; });
        SubscriptionSync._lastManualSync = {};
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.fetch;
    });

    it('should sync a feed: cache payload, store etag, count rejected patterns', async () => {
        globalThis.fetch = vi.fn(async () => okResponse());

        const res = await SubscriptionSync.syncOne(sub({ allowRegex: true }));

        expect(res.status).toBe('ok');
        expect(saved.data.sub1.customWords).toEqual(FEED.customWords);
        expect(saved.data.sub1.config.settings.usageProfile).toBe('strict');

        const patch = saved.patches[0];
        expect(patch.lastStatus).toBe('ok');
        expect(patch.etag).toBe('"v1"');
        expect(patch.rejectedPatterns).toBe(1);
        expect(patch.name).toBe('Corp Rules');

        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.method).toBe('GET');
        expect(init.credentials).toBe('omit');
    });

    it('should flag configPending when applyConfig is on and the config hash changed', async () => {
        globalThis.fetch = vi.fn(async () => okResponse());

        const res = await SubscriptionSync.syncOne(sub({ applyConfig: true, acceptedConfigHash: 'old-hash' }));
        expect(res.status).toBe('ok');
        expect(res.configPending).toBe(true);

        const hash = await SubscriptionSchema.hashConfig({ settings: { usageProfile: 'strict' } });
        const res2 = await SubscriptionSync.syncOne(sub({ applyConfig: true, acceptedConfigHash: hash }));
        expect(res2.configPending).toBe(false);
    });

    it('should handle 304 without touching the cache', async () => {
        saved.data = { sub1: { customWords: ['Cached'], config: null, fetchedAt: 1 } };
        globalThis.fetch = vi.fn(async () => okResponse({ status: 304, ok: false }));

        const res = await SubscriptionSync.syncOne(sub({ etag: '"v1"' }));

        expect(res.status).toBe('not-modified');
        expect(saved.data.sub1.customWords).toEqual(['Cached']);
        expect(saved.patches[0].lastStatus).toBe('ok');

        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.headers['If-None-Match']).toBe('"v1"');
    });

    it('should NOT send If-None-Match without a local cache (new device)', async () => {
        globalThis.fetch = vi.fn(async () => okResponse());

        await SubscriptionSync.syncOne(sub({ etag: '"v1"' }));

        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.headers['If-None-Match']).toBeUndefined();
    });

    it('should keep the cache and apply exponential backoff on failure', async () => {
        saved.data = { sub1: { customWords: ['Cached'], config: null, fetchedAt: 1 } };
        globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });

        const res1 = await SubscriptionSync.syncOne(sub());
        expect(res1.status).toBe('error');
        expect(saved.data.sub1.customWords).toEqual(['Cached']); // fail-safe: still masking
        expect(saved.patches[0].lastStatus).toBe('error');
        expect(saved.patches[0].lastError).toBe('offline');
        expect(saved.syncState.sub1.failCount).toBe(1);
        const retry1 = saved.syncState.sub1.nextRetryAt;

        await SubscriptionSync.syncOne(sub(), { force: true });
        expect(saved.syncState.sub1.failCount).toBe(2);
        expect(saved.syncState.sub1.nextRetryAt - Date.now()).toBeGreaterThan(retry1 - Date.now());
    });

    it('should skip while in backoff (and never loop via cold-start)', async () => {
        saved.syncState = { sub1: { failCount: 1, nextRetryAt: Date.now() + 60000 } };
        globalThis.fetch = vi.fn();

        const res = await SubscriptionSync.syncOne(sub());
        expect(res.status).toBe('skipped');
        expect(res.reason).toBe('backoff');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should debounce manual syncs', async () => {
        globalThis.fetch = vi.fn(async () => okResponse());

        const r1 = await SubscriptionSync.syncOne(sub(), { manual: true });
        const r2 = await SubscriptionSync.syncOne(sub(), { manual: true });

        expect(r1.status).toBe('ok');
        expect(r2.status).toBe('skipped');
        expect(r2.reason).toBe('debounce');
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should reject redirects to non-HTTPS targets', async () => {
        globalThis.fetch = vi.fn(async () => okResponse({ url: 'http://evil.com/feed.json' }));

        const res = await SubscriptionSync.syncOne(sub());
        expect(res.status).toBe('error');
        expect(res.error).toContain('non-HTTPS');
    });

    it('should reject oversized payloads via content-length', async () => {
        globalThis.fetch = vi.fn(async () => okResponse({
            headers: { get: (h) => (h === 'content-length' ? String(2 * 1024 * 1024) : null) }
        }));

        const res = await SubscriptionSync.syncOne(sub());
        expect(res.status).toBe('error');
        expect(res.error).toContain('1 MB');
    });

    it('should surface schema errors as sync errors', async () => {
        globalThis.fetch = vi.fn(async () => okResponse({
            text: async () => JSON.stringify({ schemaVersion: 99, name: 'future' })
        }));

        const res = await SubscriptionSync.syncOne(sub());
        expect(res.status).toBe('error');
        expect(res.error).toContain('update AIgis');
    });

    it('syncAll and syncMissing should skip entirely while subscriptions are globally paused', async () => {
        vi.spyOn(StorageManager, 'getSettings').mockResolvedValue({
            settings: { ...StorageManager.defaults.settings, subscriptionsEnabled: false },
            modules: {}, customWords: []
        });
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([sub()]);
        const syncOne = vi.spyOn(SubscriptionSync, 'syncOne');

        const results = await SubscriptionSync.syncAll();
        await SubscriptionSync.syncMissing();

        expect(results).toEqual([]);
        expect(syncOne).not.toHaveBeenCalled();
    });

    it('syncMissing should fetch only enabled feeds without local cache', async () => {
        saved.data = { cached1: { customWords: [], config: null, fetchedAt: 1 } };
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([
            sub({ id: 'cached1' }),
            sub({ id: 'fresh1', url: 'https://b.com/f.json' }),
            sub({ id: 'off1', url: 'https://c.com/f.json', enabled: false })
        ]);
        const syncOne = vi.spyOn(SubscriptionSync, 'syncOne').mockResolvedValue({ status: 'ok' });

        await SubscriptionSync.syncMissing();

        expect(syncOne).toHaveBeenCalledTimes(1);
        expect(syncOne.mock.calls[0][0].id).toBe('fresh1');
    });

});
