/*
 * AIgis - Storage Manager
 * Manages settings, statistics, and the PII vault (secure cache).
 */
import { Logger } from './logger.js';
import { SubscriptionSchema } from '../modules/subscriptions/subscriptionSchema.js';

export const StorageManager = {

    defaults: {
        settings: {
            enabled: true,
            debugMode: false,
            usageProfile: 'strict',
            peekMode: false,
            vaultPruneDays: 30,
            subscriptionsEnabled: true
        },
        modules: {
            email: true,
            iban: true,
            phone: true,
            address: true,
            url: true,
            ip: true,
            path: true,
            secret: true,
            custom: true,
            toon: true
        },
        customWords: [],
        stats: {
            totalPrompts: 0,
            piiTotal: 0,
            piiBreakdown: {
                email: 0,
                iban: 0,
                phone: 0,
                address: 0,
                url: 0,
                ip: 0,
                path: 0,
                secret: 0,
                custom: 0,
                other: 0
            },
            toon: {
                conversions: 0,
                originalChars: 0,
                optimizedChars: 0,
                estimatedTokensSaved: 0
            }
        },
        vault: {
            mappings: {},
            reverseIndex: {},
            counters: {}
        }
    },

    // settings in sync storage
    async getSettings() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve(this.defaults);
            chrome.storage.sync.get(['settings', 'modules', 'customWords'], (result) => {
                resolve({
                    settings: { ...this.defaults.settings, ...result.settings },
                    modules: { ...this.defaults.modules, ...result.modules },
                    customWords: result.customWords || this.defaults.customWords
                });
            });
        });
    },

    async saveSettings(data) {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
            const toSave = {};
            if (data.settings) toSave.settings = data.settings;
            if (data.modules) toSave.modules = data.modules;
            if (data.customWords) toSave.customWords = data.customWords;
            chrome.storage.sync.set(toSave, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    Logger.error('Saving settings failed:', chrome.runtime.lastError.message);
                    return resolve({ error: chrome.runtime.lastError.message });
                }
                resolve({});
            });
        });
    },

    _normalizeSubscription(sub) {
        return {
            id: sub.id,
            name: sub.name || 'Unnamed',
            description: sub.description || '',
            url: sub.url,
            enabled: sub.enabled !== false,
            applyConfig: !!sub.applyConfig,
            allowRegex: !!sub.allowRegex,
            lastUpdated: sub.lastUpdated || null,
            lastStatus: sub.lastStatus || 'pending',
            lastError: sub.lastError || null,
            etag: sub.etag || null,
            acceptedConfigHash: sub.acceptedConfigHash || null,
            rejectedPatterns: sub.rejectedPatterns || 0
        };
    },

    async getSubscriptions() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve([]);
            chrome.storage.sync.get(['subscriptions'], (result) => {
                const list = Array.isArray(result.subscriptions) ? result.subscriptions : [];
                resolve(list.filter(s => s && s.id && s.url).map(s => this._normalizeSubscription(s)));
            });
        });
    },

    async saveSubscriptions(subscriptions) {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
            chrome.storage.sync.set({ subscriptions }, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    // surface quota errors instead of failing silently (Plan §5)
                    Logger.error('Saving subscriptions failed:', chrome.runtime.lastError.message);
                    return resolve({ error: chrome.runtime.lastError.message });
                }
                resolve({});
            });
        });
    },

    async addSubscription({ url, allowRegex = false }) {
        if (typeof url !== 'string' || !url.trim().toLowerCase().startsWith('https://')) {
            return { error: 'Subscription URLs must use HTTPS.' };
        }
        const subscriptions = await this.getSubscriptions();
        const trimmedUrl = url.trim();
        if (subscriptions.some(s => s.url === trimmedUrl)) {
            return { error: 'This URL is already subscribed.' };
        }
        const sub = this._normalizeSubscription({
            id: crypto.randomUUID(),
            name: 'Pending first sync…',
            url: trimmedUrl,
            enabled: true,
            applyConfig: false,
            allowRegex: !!allowRegex
        });
        subscriptions.push(sub);
        const res = await this.saveSubscriptions(subscriptions);
        if (res && res.error) return { error: res.error };
        return { subscription: sub };
    },

    async importSubscriptions(entries) {
        const subscriptions = await this.getSubscriptions();
        let added = 0;

        for (const entry of entries) {
            if (!entry || typeof entry.url !== 'string') continue;
            const url = entry.url.trim();
            if (!url.toLowerCase().startsWith('https://')) continue;
            if (subscriptions.some(s => s.url === url)) continue;

            subscriptions.push(this._normalizeSubscription({
                id: crypto.randomUUID(),
                name: 'Pending first sync…',
                url,
                enabled: entry.enabled !== false,
                applyConfig: false,
                allowRegex: false
            }));
            added++;
        }

        if (added > 0) {
            await this.saveSubscriptions(subscriptions);
            Logger.info(`Import: ${added} subscription(s) added (consent flags reset).`);
        }
        return added;
    },

    async updateSubscription(id, patch) {
        const subscriptions = await this.getSubscriptions();
        const idx = subscriptions.findIndex(s => s.id === id);
        if (idx === -1) return null;
        subscriptions[idx] = this._normalizeSubscription({ ...subscriptions[idx], ...patch, id });
        await this.saveSubscriptions(subscriptions);
        return subscriptions[idx];
    },

    async removeSubscription(id, { importWords = false } = {}) {
        const subscriptions = await this.getSubscriptions();
        const data = await this.getSubscriptionData();

        if (importWords && data[id] && Array.isArray(data[id].customWords) && data[id].customWords.length > 0) {
            const settings = await this.getSettings();
            const merged = new Set([...settings.customWords, ...data[id].customWords]);
            settings.customWords = Array.from(merged);
            await this.saveSettings(settings);
        }

        delete data[id];
        await this.saveSubscriptionData(data);
        await this.saveSubscriptions(subscriptions.filter(s => s.id !== id));
    },

    async getSubscriptionData() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve({});
            chrome.storage.local.get(['subscriptionData'], (result) => {
                resolve(result.subscriptionData || {});
            });
        });
    },

    async saveSubscriptionData(map) {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
            chrome.storage.local.set({ subscriptionData: map }, resolve);
        });
    },

    async getEffectiveSettings() {
        const base = await this.getSettings();
        const result = { ...base, overrides: null };

        if (base.settings.subscriptionsEnabled === false) return result;

        const subscriptions = await this.getSubscriptions();
        const provider = subscriptions.find(s => s.enabled && s.applyConfig);
        if (!provider) return result;

        const data = await this.getSubscriptionData();
        const cache = data[provider.id];
        if (!cache || !cache.config) return result;

        const hash = await SubscriptionSchema.hashConfig(cache.config);
        if (!hash || hash !== provider.acceptedConfigHash) {
            Logger.info(`Overlay: config of '${provider.name}' is unconfirmed, not applied.`);
            return result;
        }

        result.settings = { ...base.settings, ...(cache.config.settings || {}) };
        result.modules = { ...base.modules, ...(cache.config.modules || {}) };

        let providerHost = '';
        try { providerHost = new URL(provider.url).hostname; } catch (e) { /* display-only */ }

        result.overrides = {
            providerId: provider.id,
            providerName: provider.name,
            providerHost,
            config: cache.config
        };

        if (Logger.isDebug) {
            const keys = [
                ...Object.keys(cache.config.settings || {}).map(k => `settings.${k}`),
                ...Object.keys(cache.config.modules || {}).map(k => `modules.${k}`)
            ];
            Logger.info(`Overlay: '${provider.name}' overrides [${keys.join(', ')}].`);
        }

        return result;
    },

    // statistics in local storage
    async getStats() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve(JSON.parse(JSON.stringify(this.defaults.stats)));
            chrome.storage.local.get(['stats'], (result) => {
                const loaded = result.stats || {};
                const merged = {
                    ...this.defaults.stats,
                    ...loaded,
                    piiBreakdown: { ...this.defaults.stats.piiBreakdown, ...(loaded.piiBreakdown || {}) },
                    toon: { ...this.defaults.stats.toon, ...(loaded.toon || {}) }
                };
                resolve(merged);
            });
        });
    },

    /**
     * Update statistics
     * @param {Object} diff - { piiCounts, toonSavings, charsOriginal, charsOptimized }
     */
    async updateStats(diff) {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        const stats = await this.getStats();

        stats.totalPrompts = (stats.totalPrompts || 0) + 1;

        if (diff.piiCounts) {
            for (const [type, count] of Object.entries(diff.piiCounts)) {
                const key = type.toLowerCase();
                if (Object.prototype.hasOwnProperty.call(stats.piiBreakdown, key)) {
                    stats.piiBreakdown[key] += count;
                } else {
                    stats.piiBreakdown.other += count;
                }
                stats.piiTotal += count;
            }
        }
        if (diff.toonSavings && diff.toonSavings > 0) {
            stats.toon.conversions = (stats.toon.conversions || 0) + 1;
            stats.toon.originalChars = (stats.toon.originalChars || 0) + (diff.charsOriginal || 0);
            stats.toon.optimizedChars = (stats.toon.optimizedChars || 0) + (diff.charsOptimized || 0);

            stats.toon.estimatedTokensSaved = (stats.toon.estimatedTokensSaved || 0) + Math.round(diff.toonSavings / 2.5);
        }

        return new Promise((resolve) => chrome.storage.local.set({ stats }, resolve));
    },

    // vault in local storage
    async getVault() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve(this.defaults.vault);
            chrome.storage.local.get(['vault'], (result) => {
                const v = result.vault || {};
                const mappings = v.mappings || {};
                let needsSave = false;

                // Lazy migration to expiration object format
                for (const key in mappings) {
                    if (typeof mappings[key] === 'string') {
                        mappings[key] = {
                            val: mappings[key],
                            expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
                        };
                        needsSave = true;
                    }
                }

                const loadedVault = {
                    mappings: mappings,
                    reverseIndex: v.reverseIndex || {},
                    counters: v.counters || {}
                };

                if (needsSave) {
                    chrome.storage.local.set({ vault: loadedVault });
                }

                resolve(loadedVault);
            });
        });
    },

    async saveVault(vaultData) {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
            chrome.storage.local.set({ vault: vaultData }, resolve);
        });
    },

    async removeVaultItems(placeholdersArray) {
        const vault = await this.getVault();

        placeholdersArray.forEach(ph => {
            const entry = vault.mappings[ph];
            if (entry) {
                const original = entry.val || entry; // fallback for pre-migration format if ever missed
                delete vault.reverseIndex[original];
            }
            delete vault.mappings[ph];
        });

        await this.saveVault(vault);
    },

    async clearVault() {
        return new Promise((resolve) => chrome.storage.local.remove(['vault'], resolve));
    },

    async findPlaceholder(originalValue) {
        const vault = await this.getVault();
        return vault.reverseIndex[originalValue] || null;
    },

    async addMapping(placeholder, originalValue, type) {
        const vault = await this.getVault();
        const settingsData = await this.getEffectiveSettings();
        const pruneDays = settingsData.settings.vaultPruneDays || 30;

        vault.mappings[placeholder] = {
            val: originalValue,
            expiresAt: Date.now() + (pruneDays * 24 * 60 * 60 * 1000)
        };
        vault.reverseIndex[originalValue] = placeholder;

        const match = placeholder.match(/_(\d+)\]$/);
        if (match && type) {
            const num = parseInt(match[1], 10);
            const currentMax = vault.counters[type] || 0;
            if (num > currentMax) {
                vault.counters[type] = num;
            }
        }
        await this.saveVault(vault);
    },

    async renewMapping(placeholder) {
        const vault = await this.getVault();
        if (vault.mappings[placeholder]) {
            const settingsData = await this.getEffectiveSettings();
            const pruneDays = settingsData.settings.vaultPruneDays || 30;
            vault.mappings[placeholder].expiresAt = Date.now() + (pruneDays * 24 * 60 * 60 * 1000);
            await this.saveVault(vault);
        }
    },

    async pruneVault() {
        const vault = await this.getVault();
        const now = Date.now();
        let changed = false;

        for (const [placeholder, data] of Object.entries(vault.mappings)) {
            if (data.expiresAt && now > data.expiresAt) {
                if (vault.reverseIndex[data.val] === placeholder) {
                    delete vault.reverseIndex[data.val];
                }
                delete vault.mappings[placeholder];
                changed = true;
            }
        }

        if (changed) {
            await this.saveVault(vault);
        }
    },

    async getNextIndex(type) {
        const vault = await this.getVault();
        const current = vault.counters[type] || 0;
        return current + 1;
    },

    async exportConfig() {
        const settings = await this.getSettings();
        const subscriptions = await this.getSubscriptions();
        const exportObj = {
            meta: { app: "AIgis", type: "configuration", version: chrome.runtime.getManifest().version, date: new Date().toISOString() },
            config: {
                enabled: settings.settings.enabled,
                usageProfile: settings.settings.usageProfile,
                peekMode: settings.settings.peekMode,
                debugMode: settings.settings.debugMode,
                subscriptionsEnabled: settings.settings.subscriptionsEnabled,
                modules: settings.modules,
                subscriptions: subscriptions.map(s => ({ url: s.url, enabled: s.enabled }))
            }
        };
        this._downloadJson(exportObj, `AIgis-Configuration-${new Date().toISOString().slice(0, 10)}.json`);
    },

    async exportDictionary() {
        const settings = await this.getSettings();
        const exportObj = {
            meta: { app: "AIgis", type: "dictionary", version: chrome.runtime.getManifest().version, date: new Date().toISOString() },
            customWords: settings.customWords || []
        };
        this._downloadJson(exportObj, `AIgis-Dictionary-${new Date().toISOString().slice(0, 10)}.json`);
    },

    async exportVault() {
        const vault = await this.getVault();
        const exportObj = {
            meta: { app: "AIgis", type: "vault", version: chrome.runtime.getManifest().version, date: new Date().toISOString() }, // Type: vault
            mappings: vault.mappings
        };
        this._downloadJson(exportObj, `AIgis-Vault-${new Date().toISOString().slice(0, 10)}.json`);
    },

    _downloadJson(obj, filename) {
        if (typeof document !== 'undefined') {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    },

    async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.meta || data.meta.app !== "AIgis") throw new Error("Invalid file");

            if (data.meta.type === "configuration") {
                const settings = await this.getSettings();
                if (data.config) {
                    const { modules, subscriptions, ...settingKeys } = data.config;
                    settings.settings = { ...settings.settings, ...settingKeys };
                    if (modules) settings.modules = { ...settings.modules, ...modules };
                    await this.saveSettings(settings);

                    if (Array.isArray(subscriptions)) {
                        await this.importSubscriptions(subscriptions);
                    }
                }
                return "configuration";
            } else if (data.meta.type === "dictionary") {
                const settings = await this.getSettings();
                if (data.customWords && Array.isArray(data.customWords)) {
                    const mergedSet = new Set([...settings.customWords, ...data.customWords]);
                    settings.customWords = Array.from(mergedSet);
                    await this.saveSettings(settings);
                }
                return "dictionary";
            } else if (data.meta.type === "settings") {
                if (data.config) await this.saveSettings(data.config);
                return "settings";
            } else if (data.meta.type === "vault") {
                if (data.mappings) {
                    const vault = await this.getVault();
                    vault.mappings = { ...vault.mappings, ...data.mappings };

                    for (const [ph, entry] of Object.entries(data.mappings)) {
                        let original = entry;
                        let expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

                        if (typeof entry === 'object' && entry.val) {
                            original = entry.val;
                            expiresAt = entry.expiresAt || expiresAt;
                        }

                        vault.mappings[ph] = { val: original, expiresAt };
                        vault.reverseIndex[original] = ph;

                        const typeMatch = ph.match(/\[([A-Z_]+)_(\d+)\]/);
                        if (typeMatch) {
                            const type = typeMatch[1];
                            const num = parseInt(typeMatch[2]);
                            if (num > (vault.counters[type] || 0)) {
                                vault.counters[type] = num;
                            }
                        }
                    }
                    await this.saveVault(vault);
                }
                return "vault";
            }
            return false;
        } catch (e) {
            Logger.error("Import failed:", e);
            return false;
        }
    }
};