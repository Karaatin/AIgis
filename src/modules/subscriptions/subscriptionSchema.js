/*
 * AIgis - Subscription Schema
 * Parses and validates remote subscription feed payloads.
 * Security: payload size cap, schema version check, strict key
 * whitelisting for config, type checks and length caps for all fields.
 * Unknown fields are ignored for forward compatibility.
 */
import { Logger } from '../../utils/logger.js';

export const SubscriptionSchema = {

    MAX_PAYLOAD_BYTES: 1024 * 1024,
    SUPPORTED_VERSION: 1,
    MAX_NAME_LENGTH: 64,
    MAX_DESCRIPTION_LENGTH: 256,
    MAX_WORDS: 5000,
    MAX_WORD_LENGTH: 256,

    ALLOWED_SETTINGS_KEYS: {
        enabled: 'boolean',
        debugMode: 'boolean',
        usageProfile: 'string',
        peekMode: 'boolean',
        vaultPruneDays: 'number'
    },
    ALLOWED_MODULE_KEYS: ['email', 'iban', 'phone', 'address', 'url', 'ip', 'path', 'secret', 'custom', 'toon'],

    /**
     * Parses a raw feed payload string.
     * @param {string} rawText
     * @returns {{ok: true, feed: object} | {ok: false, error: string}}
     */
    parse(rawText) {
        if (typeof rawText !== 'string' || rawText.trim().length === 0) {
            return this._fail('Empty payload.');
        }
        if (rawText.length > this.MAX_PAYLOAD_BYTES) {
            return this._fail('Payload exceeds the 1 MB size limit.');
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            return this._fail(`Invalid JSON: ${e.message}`);
        }

        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            return this._fail('Payload must be a JSON object.');
        }

        if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
            return this._fail("Missing or invalid 'schemaVersion'.");
        }
        if (data.schemaVersion > this.SUPPORTED_VERSION) {
            return this._fail(`Unsupported schemaVersion ${data.schemaVersion}. Please update AIgis.`);
        }

        if (typeof data.name !== 'string' || data.name.trim().length === 0) {
            return this._fail("Missing or invalid 'name'.");
        }

        const feed = {
            name: data.name.trim().substring(0, this.MAX_NAME_LENGTH),
            description: '',
            customWords: [],
            config: null
        };

        if (typeof data.description === 'string') {
            feed.description = data.description.trim().substring(0, this.MAX_DESCRIPTION_LENGTH);
        }

        if (data.customWords !== undefined) {
            if (!Array.isArray(data.customWords)) {
                return this._fail("'customWords' must be an array of strings.");
            }
            if (data.customWords.length > this.MAX_WORDS) {
                return this._fail(`'customWords' exceeds the ${this.MAX_WORDS} entry limit.`);
            }
            feed.customWords = data.customWords
                .filter(w => typeof w === 'string')
                .map(w => w.trim())
                .filter(w => w.length > 0 && w.length <= this.MAX_WORD_LENGTH);
        }

        if (data.config !== undefined) {
            if (typeof data.config !== 'object' || data.config === null || Array.isArray(data.config)) {
                return this._fail("'config' must be an object.");
            }
            const config = this._pickConfig(data.config);
            if (config) feed.config = config;
        }

        return { ok: true, feed };
    },

    /**
     * Whitelist-picks the config block. Unknown or wrongly-typed keys are dropped.
     */
    _pickConfig(rawConfig) {
        const config = {};

        if (rawConfig.settings && typeof rawConfig.settings === 'object' && !Array.isArray(rawConfig.settings)) {
            const settings = {};
            for (const [key, type] of Object.entries(this.ALLOWED_SETTINGS_KEYS)) {
                const val = rawConfig.settings[key];
                if (typeof val === type) {
                    if (key === 'usageProfile' && val !== 'strict' && val !== 'developer') continue;
                    if (key === 'vaultPruneDays' && (!Number.isInteger(val) || val < 1 || val > 365)) continue;
                    settings[key] = val;
                }
            }
            if (Object.keys(settings).length > 0) config.settings = settings;
        }

        if (rawConfig.modules && typeof rawConfig.modules === 'object' && !Array.isArray(rawConfig.modules)) {
            const modules = {};
            for (const key of this.ALLOWED_MODULE_KEYS) {
                if (typeof rawConfig.modules[key] === 'boolean') {
                    modules[key] = rawConfig.modules[key];
                }
            }
            if (Object.keys(modules).length > 0) config.modules = modules;
        }

        return Object.keys(config).length > 0 ? config : null;
    },

    /**
     * Stable SHA-256 hash of a (whitelisted) config block.
     * Used for the accepted-config confirmation flow.
     * @returns {Promise<string|null>} hex digest, or null for empty config
     */
    async hashConfig(config) {
        if (!config || Object.keys(config).length === 0) return null;
        const stable = this._stableStringify(config);
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    _stableStringify(obj) {
        if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return `[${obj.map(v => this._stableStringify(v)).join(',')}]`;
        const keys = Object.keys(obj).sort();
        return `{${keys.map(k => `${JSON.stringify(k)}:${this._stableStringify(obj[k])}`).join(',')}}`;
    },

    _fail(error) {
        Logger.info(`Subscription schema rejected: ${error}`);
        return { ok: false, error };
    }
};
