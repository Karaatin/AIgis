/*
 * AIgis - PII Detector
 */
import * as Masks from './piiMasks/index.js';
import { StorageManager } from '../utils/storage.js';

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
    }

    // order of masks matters!!! (from specific to general)
    initMasks() {
        this.masks = [];

        if (this.modules.custom && this.customWords.length > 0) {
            this.masks.push(new Masks.CustomMask(this.customWords));
        }
        if (this.modules.email) this.masks.push(new Masks.EmailMask());
        if (this.modules.iban) this.masks.push(new Masks.IBANMask());
        if (this.modules.phone) this.masks.push(new Masks.PhoneMask());
        if (this.modules.address) this.masks.push(new Masks.AddressMask());
        if (this.modules.ip) this.masks.push(new Masks.IPMask());
        if (this.modules.url) this.masks.push(new Masks.URLMask());
        if (this.modules.path) this.masks.push(new Masks.PathMask());
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

        // pipe: text is sanitized by all active masks
        for (const mask of this.masks) {
            
            // find matches
            const matches = Array.from(mask.find(currentText, this.mode));
            
            // Unique Set for database operations
            const uniqueMatches = [...new Set(matches.map(m => m[0]))];

            for (const original of uniqueMatches) {
                
                if (mask.validate && !mask.validate(original, this.mode)) {
                    continue;
                }

                const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedOriginal, 'g');

                // count for statistics
                const occurrenceCount = (currentText.match(regex) || []).length;
                
                if (occurrenceCount === 0) continue;

                // check vault and get or create placeholder
                let placeholder = await StorageManager.findPlaceholder(original);

                if (!placeholder) {
                    const index = await StorageManager.getNextIndex(mask.prefix);
                    placeholder = `[${mask.prefix}_${index}]`;
                    await StorageManager.addMapping(placeholder, original, mask.prefix);
                }

                // update session map
                sessionMap[placeholder] = original;
                
                // count up per category for statistics
                if (!piiCounts[mask.type]) piiCounts[mask.type] = 0;
                piiCounts[mask.type] += occurrenceCount;

                // replace
                currentText = currentText.replace(regex, placeholder);
            }
        }

        return {
            sanitizedText: currentText,
            piiMap: sessionMap,
            piiCounts: piiCounts
        };
    }
}