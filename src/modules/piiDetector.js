/*
 * AIgis - PII Detector
 */
import * as Masks from './piiMasks/index.js';
import { StorageManager } from '../utils/storage.js';
import { PatternValidator } from './patternValidator.js';
import { Logger } from '../utils/logger.js';

export class PiiDetector {

    constructor() {
        this.masks = [];
        this.settings = null;
        this.mode = 'strict';
        this.initialized = false;
    }

    // load settings and initialize vault & masks
    async init() {
        if (this.initialized) return;

        const data = await StorageManager.getEffectiveSettings();
        this.settings = data.settings;
        this.modules = data.modules;
        this.mode = this.settings.usageProfile || 'strict';

        const localResult = PatternValidator.validateWords(data.customWords || [], {
            allowRegex: true,
            sourceName: 'Local dictionary'
        });
        this.customWords = localResult.accepted;

        this.subscriptionWords = await this._loadSubscriptionWords();

        this.initMasks();
        this.initialized = true;

        Logger.info(`Detector initialized. Mode: '${this.mode}', active masks: [${this.masks.map(m => m.type).join(', ')}]` +
            (data.overrides ? ` (settings managed by '${data.overrides.providerName}')` : ''));
    }

    async _loadSubscriptionWords() {
        const words = [];

        if (this.settings.subscriptionsEnabled === false) {
            Logger.info('Subscriptions globally disabled, no feed words loaded.');
            return words;
        }

        const subscriptions = await StorageManager.getSubscriptions();
        if (subscriptions.length === 0) return words;

        const cache = await StorageManager.getSubscriptionData();

        for (const sub of subscriptions.filter(s => s.enabled)) {
            const entry = cache[sub.id];
            if (!entry || !Array.isArray(entry.customWords) || entry.customWords.length === 0) continue;

            const { accepted, rejected } = PatternValidator.validateWords(entry.customWords, {
                allowRegex: sub.allowRegex,
                sourceName: `Subscription '${sub.name}'`
            });
            words.push(...accepted);

            Logger.info(`Subscription '${sub.name}': ${accepted.length} words loaded` +
                (rejected.length ? `, ${rejected.length} rejected` : '') + '.');
        }

        return words;
    }

    // order of masks matters!!!
    initMasks() {
        this.masks = [];

        if (this.modules.secret) this.masks.push(new Masks.SecretMask());
        if (this.modules.email) this.masks.push(new Masks.EmailMask());
        if (this.modules.iban) this.masks.push(new Masks.IBANMask());
        if (this.modules.phone) this.masks.push(new Masks.PhoneMask());
        if (this.modules.address) this.masks.push(new Masks.AddressMask());
        if (this.modules.path) this.masks.push(new Masks.PathMask());
        if (this.modules.ip) this.masks.push(new Masks.IPMask());
        if (this.modules.url) this.masks.push(new Masks.URLMask());
        const allCustomWords = [...this.customWords, ...(this.subscriptionWords || [])];
        if (this.modules.custom && allCustomWords.length > 0) {
            this.masks.push(new Masks.CustomMask(allCustomWords));
        }
    }

    /**
     * Main function: Scans text, checks vault, replaces PIIs.
     * @param {string} text - The original prompt
     * @returns {Promise<object>} { sanitizedText, piiMap, piiCounts }
     */
    async sanitize(text) {
        if (!text) return { sanitizedText: "", piiMap: {}, piiCounts: {} };

        if (!this.initialized) await this.init();

        if (!this.settings.enabled) {
            return { sanitizedText: text, piiMap: {}, piiCounts: {} };
        }

        let currentText = text;
        const sessionMap = {};
        const piiCounts = {};
        const uuidMap = {};
        const generateUUID = () => crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2, 15);

        const vault = await StorageManager.getVault();
        let vaultModified = false;

        // pipe: text is sanitized by all active masks
        for (const mask of this.masks) {

            // find matches
            const matches = Array.from(mask.find(currentText, this.mode));

            // unique Set for database operations
            const uniqueMatches = [...new Set(matches.map(m => m[0]))];

            if (uniqueMatches.length > 0) {
                Logger.info(`${mask.type}: ${uniqueMatches.length} unique candidate(s) found.`);
            }

            for (const original of uniqueMatches) {

                if (mask.validate && !mask.validate(original, this.mode)) {
                    Logger.info(`${mask.type}: candidate "${original}" rejected by '${this.mode}' mode filter.`);
                    continue;
                }

                const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedOriginal, 'g');

                // count for statistics
                const occurrenceCount = (currentText.match(regex) || []).length;

                if (occurrenceCount === 0) continue;

                let placeholder = vault.reverseIndex[original];

                if (placeholder) {
                    Logger.info(`${mask.type}: vault hit, reusing ${placeholder} (${occurrenceCount}x).`);
                } else {
                    const currentMax = vault.counters[mask.prefix] || 0;
                    const nextIndex = currentMax + 1;
                    vault.counters[mask.prefix] = nextIndex;

                    placeholder = `[${mask.prefix}_${nextIndex}]`;

                    const pruneDays = this.settings.vaultPruneDays || 30;
                    vault.mappings[placeholder] = {
                        val: original,
                        expiresAt: Date.now() + (pruneDays * 24 * 60 * 60 * 1000)
                    };
                    vault.reverseIndex[original] = placeholder;
                    vaultModified = true;

                    Logger.info(`${mask.type}: new mapping ${placeholder} created (${occurrenceCount}x, expires in ${pruneDays} days).`);
                }

                // temporary UUID to prevent later regex passes from corrupting the placeholder
                const tempUUID = `%%${generateUUID()}%%`;
                uuidMap[tempUUID] = placeholder;

                // update session map
                sessionMap[placeholder] = original;

                // count up per category for statistics
                if (!piiCounts[mask.type]) piiCounts[mask.type] = 0;
                piiCounts[mask.type] += occurrenceCount;

                // replace with UUID
                currentText = currentText.replace(regex, tempUUID);
            }
        }

        // final pass: UUIDs -> real placeholders
        for (const [uuid, placeholder] of Object.entries(uuidMap)) {
            currentText = currentText.replace(new RegExp(uuid, 'g'), placeholder);
        }

        if (vaultModified) {
            await StorageManager.saveVault(vault);
        }

        return {
            sanitizedText: currentText,
            piiMap: sessionMap,
            piiCounts: piiCounts
        };
    }
}