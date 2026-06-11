/*
 * AIgis - PII Detector
 */
import * as Masks from './piiMasks/index.js';
import { StorageManager } from '../utils/storage.js';
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

        const data = await StorageManager.getSettings();
        this.settings = data.settings;
        this.modules = data.modules;
        this.customWords = data.customWords || [];
        this.mode = this.settings.usageProfile || 'strict';

        this.initMasks();
        this.initialized = true;

        Logger.info(`Detector initialized. Mode: '${this.mode}', active masks: [${this.masks.map(m => m.type).join(', ')}]`);
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
        if (this.modules.custom && this.customWords.length > 0) {
            this.masks.push(new Masks.CustomMask(this.customWords));
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

                    // add mapping locally in canonical {val, expiresAt} format,
                    // honoring the user's configured prune interval
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