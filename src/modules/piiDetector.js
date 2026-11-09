/*
 * AIgis - PII Detector
 */
import * as Masks from './piiMasks/index.js';
import { StorageManager } from '../utils/storage.js';
import { PatternValidator } from './patternValidator.js';
import { Logger } from '../utils/logger.js';

const LONG_MATCH_CHARS = 2000; // longer matches are replaced literally
const MAX_ALTERNATION_CHARS = 100000;
const DEBUG_DETAIL_LIMIT = 25;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// temporary tokens use private use area chars, so no mask can match inside them
const TOKEN_BLOCK = 0x20;
const u4 = (n) => '\\u' + n.toString(16).padStart(4, '0');

function createTokenCodec(text) {
    // skip blocks that already occur in the text
    let base = 0xE000;
    while (base + TOKEN_BLOCK <= 0xF900 && new RegExp(`[${u4(base)}-${u4(base + TOKEN_BLOCK - 1)}]`).test(text)) {
        base += TOKEN_BLOCK;
    }
    const open = String.fromCharCode(base);
    const close = String.fromCharCode(base + 1);
    const digit0 = base + 0x10;
    const digits = Array.from({ length: 16 }, (_, k) => String.fromCharCode(digit0 + k));

    return {
        encode(index) {
            let body = '';
            for (const c of index.toString(16)) body += digits[parseInt(c, 16)];
            return open + body + close;
        },
        decode(body) {
            let index = 0;
            for (let k = 0; k < body.length; k++) index = index * 16 + (body.charCodeAt(k) - digit0);
            return index;
        },
        pattern: new RegExp(`${u4(base)}([${u4(digit0)}-${u4(digit0 + 15)}]+)${u4(base + 1)}`, 'g')
    };
}

/**
 * Replaces all candidates in one pass (longest first) and counts their occurrences.
 * @returns {{ text: string, hits: number[] }}
 */
function replaceCandidates(text, candidates, tokenFor) {
    const hits = new Array(candidates.length).fill(0);
    const byLength = candidates.map((_, i) => i)
        .sort((a, b) => candidates[b].length - candidates[a].length || a - b);

    const replaceLiteral = (i) => {
        const parts = text.split(candidates[i]);
        hits[i] = parts.length - 1;
        if (hits[i] > 0) text = parts.join(tokenFor(i));
    };

    let batch = [];
    let batchChars = 0;
    const flush = () => {
        if (batch.length === 0) return;
        let regex = null;
        try {
            regex = new RegExp(batch.map(i => escapeRegex(candidates[i])).join('|'), 'g');
        } catch (e) {
            Logger.warn(`Combined mask regex rejected (${e.message}), falling back to literal replacement.`);
        }
        if (regex) {
            const indexOf = new Map(batch.map(i => [candidates[i], i]));
            text = text.replace(regex, (m) => {
                const i = indexOf.get(m);
                hits[i]++;
                return tokenFor(i);
            });
        } else {
            batch.forEach(replaceLiteral);
        }
        batch = [];
        batchChars = 0;
    };

    for (const i of byLength) {
        const length = candidates[i].length;
        if (length > LONG_MATCH_CHARS) {
            replaceLiteral(i);
            continue;
        }
        if (batchChars + length > MAX_ALTERNATION_CHARS) flush();
        batch.push(i);
        batchChars += length + 1;
    }
    flush();

    return { text, hits };
}

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

    // debug output, capped per mask
    _logMaskResult(mask, candidateCount, rejected, reused, created, pruneDays) {
        Logger.info(`${mask.type}: ${candidateCount} unique candidate(s) found.`);
        const list = (items, describe) => {
            items.slice(0, DEBUG_DETAIL_LIMIT).forEach(item => Logger.info(describe(item)));
            if (items.length > DEBUG_DETAIL_LIMIT) Logger.info(`${mask.type}: … and ${items.length - DEBUG_DETAIL_LIMIT} more.`);
        };
        list(rejected, (original) => `${mask.type}: candidate "${original}" rejected by '${this.mode}' mode filter.`);
        list(reused, ([placeholder, count]) => `${mask.type}: vault hit, reusing ${placeholder} (${count}x).`);
        list(created, ([placeholder, count]) => `${mask.type}: new mapping ${placeholder} created (${count}x, expires in ${pruneDays} days).`);
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
        const tokenPlaceholders = []; // token index -> placeholder
        const tokens = createTokenCodec(text);

        const vault = await StorageManager.getVault();
        let vaultModified = false;
        const pruneDays = this.settings.vaultPruneDays || 30;

        // pipe: text is sanitized by all active masks
        for (const mask of this.masks) {

            // find matches
            const matches = Array.from(mask.find(currentText, this.mode));

            // unique Set for database operations
            const uniqueMatches = [...new Set(matches.map(m => m[0]))];
            if (uniqueMatches.length === 0) continue;

            const candidates = [];
            const rejected = [];
            for (const original of uniqueMatches) {
                if (mask.validate && !mask.validate(original, this.mode)) rejected.push(original);
                else candidates.push(original);
            }

            const base = tokenPlaceholders.length;
            const replaced = replaceCandidates(currentText, candidates, i => tokens.encode(base + i));
            currentText = replaced.text;
            tokenPlaceholders.length = base + candidates.length;

            // placeholders in first-seen order
            const reused = [];
            const created = [];
            for (let i = 0; i < candidates.length; i++) {
                const occurrenceCount = replaced.hits[i];
                if (occurrenceCount === 0) continue; // only inside longer candidates

                const original = candidates[i];
                let placeholder = vault.reverseIndex[original];

                if (placeholder) {
                    reused.push([placeholder, occurrenceCount]);
                } else {
                    const nextIndex = (vault.counters[mask.prefix] || 0) + 1;
                    vault.counters[mask.prefix] = nextIndex;

                    placeholder = `[${mask.prefix}_${nextIndex}]`;
                    vault.mappings[placeholder] = {
                        val: original,
                        expiresAt: Date.now() + (pruneDays * 24 * 60 * 60 * 1000)
                    };
                    vault.reverseIndex[original] = placeholder;
                    vaultModified = true;
                    created.push([placeholder, occurrenceCount]);
                }

                tokenPlaceholders[base + i] = placeholder;
                sessionMap[placeholder] = original;
                piiCounts[mask.type] = (piiCounts[mask.type] || 0) + occurrenceCount;
            }

            if (Logger.isDebug) this._logMaskResult(mask, uniqueMatches.length, rejected, reused, created, pruneDays);
        }

        // tokens -> real placeholders
        currentText = currentText.replace(tokens.pattern, (_, body) => tokenPlaceholders[tokens.decode(body)]);

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