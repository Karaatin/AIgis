/*
 * AIgis - Storage Manager
 * Manages settings, statistics, and the PII vault (secure cache).
 */
export const StorageManager = {
    
    defaults: {
        settings: {
            enabled: true,
            debugMode: false,
            usageProfile: 'strict'
        },
        modules: {
            email: true, 
            iban: true, 
            phone: true, 
            address: true,
            url: true, 
            ip: true, 
            path: true, 
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
            chrome.storage.sync.set(toSave, resolve);
        });
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
            
            stats.toon.estimatedTokensSaved = (stats.toon.estimatedTokensSaved || 0) + (diff.toonSavings / 4);
        }
        
        return new Promise((resolve) => chrome.storage.local.set({ stats }, resolve));
    },

    // vault in local storage
    async getVault() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) return resolve(this.defaults.vault);
            chrome.storage.local.get(['vault'], (result) => {
                const v = result.vault || {};
                resolve({
                    mappings: v.mappings || {},
                    reverseIndex: v.reverseIndex || {},
                    counters: v.counters || {}
                });
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
            const original = vault.mappings[ph];
            if (original) {
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
        vault.mappings[placeholder] = originalValue;
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

    async getNextIndex(type) {
        const vault = await this.getVault();
        const current = vault.counters[type] || 0;
        return current + 1;
    },
    
    // import/export
    async exportData() {
        const settings = await this.getSettings();
        const stats = await this.getStats();
        const exportObj = {
            meta: { app: "AIgis", type: "settings", version: chrome.runtime.getManifest().version, date: new Date().toISOString() },
            config: settings,
            stats: stats
        };
        this._downloadJson(exportObj, `AIgis-Settings-${new Date().toISOString().slice(0,10)}.json`);
    },

    async exportVault() {
        const vault = await this.getVault();
        const exportObj = {
            meta: { app: "AIgis", type: "vault", version: chrome.runtime.getManifest().version, date: new Date().toISOString() }, // Type: vault
            mappings: vault.mappings
        };
        this._downloadJson(exportObj, `AIgis-Vault-${new Date().toISOString().slice(0,10)}.json`);
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

            if (data.meta.type === "settings") {
                if (data.config) await this.saveSettings(data.config);
                return "settings";
            } else if (data.meta.type === "vault") {
                if (data.mappings) {
                    const vault = await this.getVault();
                    vault.mappings = { ...vault.mappings, ...data.mappings };
                    
                    for (const [ph, orig] of Object.entries(data.mappings)) {
                        vault.reverseIndex[orig] = ph;
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
            console.error("Import failed:", e);
            return false;
        }
    }
};