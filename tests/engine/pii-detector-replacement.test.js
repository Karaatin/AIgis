import { describe, it, expect, vi, afterEach } from 'vitest';
import { PiiDetector } from '../../src/modules/piiDetector.js';
import { StorageManager } from '../../src/utils/storage.js';

describe('PiiDetector: replacement engine', () => {

    function mockEnv() {
        vi.spyOn(StorageManager, 'getEffectiveSettings').mockResolvedValue({
            settings: { ...StorageManager.defaults.settings },
            modules: { ...StorageManager.defaults.modules },
            customWords: [],
            overrides: null
        });
        vi.spyOn(StorageManager, 'getSubscriptions').mockResolvedValue([]);
        vi.spyOn(StorageManager, 'getSubscriptionData').mockResolvedValue({});
        vi.spyOn(StorageManager, 'getVault').mockResolvedValue({ mappings: {}, reverseIndex: {}, counters: {} });
        vi.spyOn(StorageManager, 'saveVault').mockResolvedValue({});
    }

    // log lines with n distinct e-mails, IPs and paths
    function logLines(n) {
        let text = '';
        for (let i = 1; i <= n; i++) {
            text += `2026-11-09 INFO user=user.${i}@corp-mail.example from 10.${(i >> 8) & 255}.${i & 255}.${(i % 200) + 20} GET /api/orders/${i}\n`;
        }
        return text;
    }

    afterEach(() => vi.restoreAllMocks());

    it('should number placeholders in first-seen order and reuse them for repeats', async () => {
        mockEnv();
        const res = await new PiiDetector().sanitize('a@corp.io, b@corp.io, a@corp.io and c@corp.io');

        expect(res.sanitizedText).toBe('[EMAIL_1], [EMAIL_2], [EMAIL_1] and [EMAIL_3]');
        expect(res.piiCounts.EMAIL).toBe(4);
    });

    it('should give a value that contains another value of the same type its own placeholder', async () => {
        mockEnv();
        const res = await new PiiDetector().sanitize('Hosts: 10.0.0.1 and 10.0.0.15 and 10.0.0.1 again.');

        expect(res.sanitizedText).toBe('Hosts: [IP_ADDRESS_1] and [IP_ADDRESS_2] and [IP_ADDRESS_1] again.');
    });

    it('should never corrupt placeholders through its temporary tokens', async () => {
        mockEnv();
        const res = await new PiiDetector().sanitize(logLines(400));

        expect(new Set(res.sanitizedText.match(/\[EMAIL_\d+\]/g)).size).toBe(400);
        expect(new Set(res.sanitizedText.match(/\[FILE_PATH_\d+\]/g)).size).toBe(400);
        expect(res.piiCounts.EMAIL).toBe(400);
        expect(res.sanitizedText).not.toMatch(/\[IBAN_\d+\]/);
        // no token leftovers or fragments like "[FILE_PATH_1]2"
        expect(res.sanitizedText).not.toMatch(/%%|[-]|\]\d/);
        expect(res.sanitizedText).not.toContain('@corp-mail.example');
    });

    it('should leave Private Use Area characters in the input untouched', async () => {
        mockEnv();
        const icons = ' '; // e.g. Nerd Font icons
        const res = await new PiiDetector().sanitize(`${icons} deploy by ops.lead@corp.io ${icons}`);

        expect(res.sanitizedText).toBe(`${icons} deploy by [EMAIL_1] ${icons}`);
    });

    it('should mask very long matches literally (e.g. a pasted base64 blob)', async () => {
        mockEnv();
        let blob = '';
        for (let i = 0; i < 6000; i++) {
            blob += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[(i * 7919 + (i >> 3)) % 62];
        }
        const res = await new PiiDetector().sanitize(`payload: ${blob} end`);

        expect(res.sanitizedText).toBe('payload: [SECRET_1] end');
    });

    it('should sanitize a large, PII-dense paste quickly', async () => {
        mockEnv();
        const text = logLines(5000);

        const started = performance.now();
        const res = await new PiiDetector().sanitize(text);
        const elapsed = performance.now() - started;

        expect(new Set(res.sanitizedText.match(/\[EMAIL_\d+\]/g)).size).toBe(5000);
        expect(elapsed).toBeLessThan(3000);
    }, 20000);

});
