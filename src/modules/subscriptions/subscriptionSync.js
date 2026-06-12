/*
 * AIgis - Subscription Sync Engine
 * One-way GET fetches of subscription feeds.
 *
 * Lifecycle: 24h chrome.alarms with one-time jitter, onStartup sync,
 * cold-start fetch for synced-but-uncached subscriptions, ETag conditional
 * requests, per-feed exponential backoff, manual sync debounce.
 */
import { StorageManager } from '../../utils/storage.js';
import { SubscriptionSchema } from './subscriptionSchema.js';
import { PatternValidator } from '../patternValidator.js';
import { Logger } from '../../utils/logger.js';

export const SubscriptionSync = {

    ALARM_NAME: 'aigis-subscription-sync',
    SYNC_PERIOD_MINUTES: 24 * 60,
    MANUAL_DEBOUNCE_MS: 30 * 1000,
    BACKOFF_BASE_MS: 60 * 60 * 1000,
    BACKOFF_CAP_MS: 24 * 60 * 60 * 1000,

    _lastManualSync: {},

    async ensureAlarm() {
        if (typeof chrome === 'undefined' || !chrome.alarms) return;
        const existing = await chrome.alarms.get(this.ALARM_NAME);
        if (!existing) {
            const jitterMinutes = Math.floor(Math.random() * 61) - 30;
            chrome.alarms.create(this.ALARM_NAME, {
                periodInMinutes: this.SYNC_PERIOD_MINUTES + jitterMinutes,
                delayInMinutes: 1
            });
            Logger.info(`Subscription sync alarm created (period ${this.SYNC_PERIOD_MINUTES + jitterMinutes} min).`);
        }
    },

    async getSyncState() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve({});
            chrome.storage.local.get(['subscriptionSyncState'], (r) => resolve(r.subscriptionSyncState || {}));
        });
    },

    async saveSyncState(state) {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
            chrome.storage.local.set({ subscriptionSyncState: state }, resolve);
        });
    },

    async syncAll({ force = false } = {}) {
        const settingsData = await StorageManager.getSettings();
        if (settingsData.settings.subscriptionsEnabled === false) {
            Logger.info('Subscriptions globally disabled, skipping scheduled sync.');
            return [];
        }

        const subscriptions = await StorageManager.getSubscriptions();
        const enabled = subscriptions.filter(s => s.enabled);
        if (enabled.length === 0) return [];

        Logger.group('Subscription Sync');
        const results = [];
        for (const sub of enabled) {
            results.push(await this.syncOne(sub, { force }));
        }
        Logger.groupEnd();
        return results;
    },

    async syncMissing() {
        const settingsData = await StorageManager.getSettings();
        if (settingsData.settings.subscriptionsEnabled === false) return;

        const subscriptions = await StorageManager.getSubscriptions();
        const data = await StorageManager.getSubscriptionData();
        for (const sub of subscriptions.filter(s => s.enabled && !data[s.id])) {
            Logger.info(`Cold start: fetching uncached subscription '${sub.name}'.`);
            await this.syncOne(sub, {});
        }
    },

    /**
     * @returns {Promise<{status: 'ok'|'not-modified'|'skipped'|'error', ...}>}
     */
    async syncOne(sub, { force = false, manual = false } = {}) {

        if (manual) {
            const last = this._lastManualSync[sub.id] || 0;
            if (Date.now() - last < this.MANUAL_DEBOUNCE_MS) {
                return { status: 'skipped', reason: 'debounce' };
            }
            this._lastManualSync[sub.id] = Date.now();
        }

        const state = await this.getSyncState();
        const subState = state[sub.id] || {};

        if (!force && !manual && subState.nextRetryAt && Date.now() < subState.nextRetryAt) {
            Logger.info(`'${sub.name}': in backoff until ${new Date(subState.nextRetryAt).toISOString()}, skipping.`);
            return { status: 'skipped', reason: 'backoff' };
        }

        try {
            const data = await StorageManager.getSubscriptionData();

            const headers = {};
            if (sub.etag && data[sub.id]) headers['If-None-Match'] = sub.etag;

            const response = await fetch(sub.url, {
                method: 'GET',
                headers,
                credentials: 'omit',
                cache: 'no-cache',
                redirect: 'follow'
            });

            if (response.status === 304) {
                await StorageManager.updateSubscription(sub.id, {
                    lastUpdated: new Date().toISOString(),
                    lastStatus: 'ok',
                    lastError: null
                });
                delete state[sub.id];
                await this.saveSyncState(state);
                Logger.info(`'${sub.name}': not modified (304).`);
                return { status: 'not-modified' };
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // redirect hardening: final URL must still be HTTPS
            if (response.url && !response.url.toLowerCase().startsWith('https://')) {
                throw new Error('Redirected to a non-HTTPS target.');
            }

            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > SubscriptionSchema.MAX_PAYLOAD_BYTES) {
                throw new Error('Payload exceeds the 1 MB size limit.');
            }

            const text = await response.text();
            const parsed = SubscriptionSchema.parse(text);
            if (!parsed.ok) throw new Error(parsed.error);

            const { rejected } = PatternValidator.validateWords(parsed.feed.customWords, {
                allowRegex: sub.allowRegex,
                sourceName: `Subscription '${parsed.feed.name}'`
            });

            data[sub.id] = {
                customWords: parsed.feed.customWords,
                config: parsed.feed.config,
                fetchedAt: Date.now()
            };
            await StorageManager.saveSubscriptionData(data);

            const newHash = await SubscriptionSchema.hashConfig(parsed.feed.config);
            const configPending = !!(sub.applyConfig && newHash && newHash !== sub.acceptedConfigHash);

            await StorageManager.updateSubscription(sub.id, {
                name: parsed.feed.name,
                description: parsed.feed.description,
                lastUpdated: new Date().toISOString(),
                lastStatus: 'ok',
                lastError: null,
                etag: response.headers.get('etag') || null,
                rejectedPatterns: rejected.length
            });

            delete state[sub.id];
            await this.saveSyncState(state);

            Logger.info(`'${parsed.feed.name}': synced. ${parsed.feed.customWords.length} words (${rejected.length} rejected), ` +
                `config: ${parsed.feed.config ? (configPending ? 'CHANGED, awaiting confirmation' : 'unchanged/accepted') : 'none'}, ` +
                `${text.length} bytes.`);

            return { status: 'ok', configPending, configHash: newHash, rejectedCount: rejected.length };

        } catch (e) {
            const failCount = (subState.failCount || 0) + 1;
            const backoff = Math.min(this.BACKOFF_BASE_MS * Math.pow(2, failCount - 1), this.BACKOFF_CAP_MS);
            state[sub.id] = { failCount, nextRetryAt: Date.now() + backoff };
            await this.saveSyncState(state);

            await StorageManager.updateSubscription(sub.id, {
                lastStatus: 'error',
                lastError: e.message
            });

            Logger.warn(`'${sub.name}': sync failed (${e.message}). ` +
                `Keeping cached rules. Retry #${failCount} in ${Math.round(backoff / 60000)} min.`);

            return { status: 'error', error: e.message };
        }
    }
};
