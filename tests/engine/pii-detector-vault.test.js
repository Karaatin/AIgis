import { describe, it, expect, vi, afterEach } from 'vitest';
import { PiiDetector } from '../../src/modules/piiDetector.js';
import { StorageManager } from '../../src/utils/storage.js';

/**
 * Regression test: sanitize() must persist new vault mappings in the
 * canonical {val, expiresAt} object format (not as a plain string),
 * honoring the user's configured vaultPruneDays.
 */
describe('PiiDetector: Vault mapping format', () => {

    const DAY_MS = 24 * 60 * 60 * 1000;

    function freshVault() {
        return { mappings: {}, reverseIndex: {}, counters: {} };
    }

    function mockStorage({ pruneDays = 30, vault = freshVault() } = {}) {
        let savedVault = null;

        vi.spyOn(StorageManager, 'getSettings').mockResolvedValue({
            settings: { ...StorageManager.defaults.settings, vaultPruneDays: pruneDays },
            modules: { ...StorageManager.defaults.modules },
            customWords: []
        });
        vi.spyOn(StorageManager, 'getVault').mockResolvedValue(vault);
        vi.spyOn(StorageManager, 'saveVault').mockImplementation(async (v) => {
            savedVault = v;
        });

        return () => savedVault;
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should store new mappings as {val, expiresAt} objects', async () => {
        const getSaved = mockStorage();

        const detector = new PiiDetector();
        const before = Date.now();
        const result = await detector.sanitize('Contact john.smith@corporation.com please.');
        const after = Date.now();

        expect(result.sanitizedText).toContain('[EMAIL_1]');

        const saved = getSaved();
        expect(saved).not.toBeNull();

        const entry = saved.mappings['[EMAIL_1]'];
        expect(typeof entry).toBe('object');
        expect(entry.val).toBe('john.smith@corporation.com');

        // default prune interval of 30 days
        expect(entry.expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
        expect(entry.expiresAt).toBeLessThanOrEqual(after + 30 * DAY_MS);

        expect(saved.reverseIndex['john.smith@corporation.com']).toBe('[EMAIL_1]');
    });

    it('should honor the configured vaultPruneDays setting', async () => {
        const getSaved = mockStorage({ pruneDays: 7 });

        const detector = new PiiDetector();
        const before = Date.now();
        await detector.sanitize('Reach me at jane.doe99@gmail.com');
        const after = Date.now();

        const entry = getSaved().mappings['[EMAIL_1]'];
        expect(entry.expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
        expect(entry.expiresAt).toBeLessThanOrEqual(after + 7 * DAY_MS);
    });

    it('should reuse existing placeholders via reverseIndex without saving', async () => {
        const vault = freshVault();
        vault.mappings['[EMAIL_1]'] = { val: 'john.smith@corporation.com', expiresAt: Date.now() + DAY_MS };
        vault.reverseIndex['john.smith@corporation.com'] = '[EMAIL_1]';
        vault.counters['EMAIL'] = 1;

        const getSaved = mockStorage({ vault });

        const detector = new PiiDetector();
        const result = await detector.sanitize('Mail john.smith@corporation.com again.');

        expect(result.sanitizedText).toContain('[EMAIL_1]');
        // no new mapping was created, so the vault must not be re-saved
        expect(getSaved()).toBeNull();
    });

});
