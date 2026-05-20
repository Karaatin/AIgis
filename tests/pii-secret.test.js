import { describe, it, expect } from 'vitest';
import SecretMask from '../src/modules/piiMasks/piiMask-Secret.js';

describe('PII Mask Logic: Secrets', () => {

    it('should find AWS keys', () => {
        const mask = new SecretMask();
        const text = "My key is AKIAIOSFODNN7EXAMPLE and temp key is ASIAIOSFODNN7EXAMPLE.";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('AKIAIOSFODNN7EXAMPLE');
        expect(matches).toContain('ASIAIOSFODNN7EXAMPLE');
    });

    it('should find Google API keys', () => {
        const mask = new SecretMask();
        const text = "Key: AIzaSyA12345678901234567890123456789012";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('AIzaSyA12345678901234567890123456789012');
    });

    it('should find GitHub PATs', () => {
        const mask = new SecretMask();
        const text = "Token ghp_123456789012345678901234567890123456 and fine-grained github_pat_1234567890123456789012";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('ghp_123456789012345678901234567890123456');
        expect(matches).toContain('github_pat_1234567890123456789012');
    });

    it('should find JWT tokens', () => {
        const mask = new SecretMask();
        const text = "My JWT is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    });

    it('should find DB connections', () => {
        const mask = new SecretMask();
        const text = "postgresql://user:password123@localhost:5432/mydb or mongodb://admin:pass@cluster.mongodb.net/db";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('postgresql://user:password123@localhost:5432/mydb');
        expect(matches).toContain('mongodb://admin:pass@cluster.mongodb.net/db');
    });

    it('should find Stripe keys', () => {
        const mask = new SecretMask();
        const text = "stripe.apiKey = \"sk_live_123456789012345678901234\"";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0]).toMatch(/sk_live_/);
    });

    it('should find Twilio credentials', () => {
        const mask = new SecretMask();
        const text = "SID: AC12345678901234567890123456789012";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('AC12345678901234567890123456789012');
    });

    it('should find Slack tokens', () => {
        const mask = new SecretMask();
        const text = "xoxb-123456789012-1234567890123-123456789012345678901234";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('xoxb-123456789012-1234567890123-123456789012345678901234');
    });

    it('should find Private Keys', () => {
        const mask = new SecretMask();
        const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0y8q9c7P...
-----END RSA PRIVATE KEY-----`;
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain(text);
    });

    it('should find High-entropy random secrets', () => {
        const mask = new SecretMask();
        const text = "The secret token is X5r9pQ2w7jLm4Kz1v9bTx8Yc.";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('X5r9pQ2w7jLm4Kz1v9bTx8Yc');
    });

    it('should find api_secret and access_token format patterns', () => {
        const mask = new SecretMask();
        const text = "api_secret: d83hf73j92ks84jd93hf72k and access_token: a1b2c3d4e5f6g7h8i9j0k";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('api_secret: d83hf73j92ks84jd93hf72k');
        expect(matches).toContain('access_token: a1b2c3d4e5f6g7h8i9j0k');
    });

    it('should NOT match standard words or ordinary URLs', () => {
        const mask = new SecretMask();
        const text = "Hello world! This is a simple test website: https://github.com/souvikghosh957/secret-sanitizer-extension.";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches.length).toBe(0);
    });

    it('should handle overlaps cleanly (prioritizing outer/earlier matches)', () => {
        const mask = new SecretMask();
        const text = "Database url is postgres://admin:d8f8a7e6c5b4a3f2e1d0c9b8@localhost:5432/mydb";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('postgres://admin:d8f8a7e6c5b4a3f2e1d0c9b8@localhost:5432/mydb');
        expect(matches).not.toContain('d8f8a7e6c5b4a3f2e1d0c9b8');
        expect(matches.length).toBe(1);
    });

    it('should find Azure tenant/secret keys', () => {
        const mask = new SecretMask();
        const text = "azure = \"abcdef01-abcd-1234-abcd-abcdef012345\"";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0]).toContain('abcdef01-abcd-1234-abcd-abcdef012345');
    });

    it('should find GitLab tokens', () => {
        const mask = new SecretMask();
        const text = "glpat-12345678901234567890 and glptt-12345678901234567890";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('glpat-12345678901234567890');
        expect(matches).toContain('glptt-12345678901234567890');
    });

    it('should find Square, Razorpay, Paytm keys', () => {
        const mask = new SecretMask();
        const text = "sq0atp-1234567890123456789012 and sq0csp-1234567890123456789012 and rzp_live_12345678901234 and paytm_key = abcdef0123456789abcd";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('sq0atp-1234567890123456789012');
        expect(matches).toContain('sq0csp-1234567890123456789012');
        expect(matches).toContain('rzp_live_12345678901234');
        expect(matches.some(m => m.includes('abcdef0123456789abcd'))).toBe(true);
    });

    it('should find Discord, Telegram bot, SendGrid, Mailgun', () => {
        const mask = new SecretMask();
        const text = "Discord: https://discordapp.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz0123456789 Telegram: 123456789:abcdefghijklmnopqrstuvwxyz0123456789 SendGrid: SG.1234567890123456789012.abcdefghijklmnopqrstuvwx Mailgun: mailgun_api_key = key-abcdefghijklmnopqrstuvwxyz012345";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('https://discordapp.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches).toContain('123456789:abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches).toContain('SG.1234567890123456789012.abcdefghijklmnopqrstuvwx');
        expect(matches.some(m => m.includes('key-abcdefghijklmnopqrstuvwxyz012345'))).toBe(true);
    });

    it('should find AI/ML API keys (Anthropic, OpenAI, Groq, HuggingFace)', () => {
        const mask = new SecretMask();
        const text = "sk-ant-abcdefghijklmnopqrstuvwxyz012345 and sk-abcdefghijklmnopqrstuvwxyz012345 and sk-proj-abcdefghijklmnopqrstuvwxyz012345 and gsk_abcdefghijklmnopqrstuvwxyz0123456789abcdefgh and hf_abcdefghijklmnopqrstuvwxyz0123456789";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('sk-ant-abcdefghijklmnopqrstuvwxyz012345');
        expect(matches).toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
        expect(matches).toContain('sk-proj-abcdefghijklmnopqrstuvwxyz012345');
        expect(matches).toContain('gsk_abcdefghijklmnopqrstuvwxyz0123456789abcdefgh');
        expect(matches).toContain('hf_abcdefghijklmnopqrstuvwxyz0123456789');
    });

    it('should find Firebase, Heroku, Vercel, DO, Supabase, Cloudflare, Datadog', () => {
        const mask = new SecretMask();
        const text = "Firebase: AAAAabcdef:abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789 Heroku: HEROKU_API_KEY = abcdef01-abcd-1234-abcd-abcdef012345 Vercel: vcpc_abcdefghijklmnopqrstuvwx DO: dop_v1_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01 doctl-abcdefghijklmnopqrstuvwxyz0123456789 Supabase: sbp_abcdefghijklmnopqrstuvwxyz0123456789 Cloudflare: CF_API_TOKEN = abcdefghijklmnopqrstuvwxyz0123456789abcd Datadog: DD_API_KEY = abcdefghijklmnopqrstuvwxyz012345";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('AAAAabcdef:abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches.some(m => m.includes('abcdef01-abcd-1234-abcd-abcdef012345'))).toBe(true);
        expect(matches).toContain('vcpc_abcdefghijklmnopqrstuvwx');
        expect(matches).toContain('dop_v1_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01');
        expect(matches).toContain('doctl-abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches).toContain('sbp_abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches.some(m => m.includes('abcdefghijklmnopqrstuvwxyz0123456789abcd'))).toBe(true);
        expect(matches.some(m => m.includes('abcdefghijklmnopqrstuvwxyz012345'))).toBe(true);
    });

    it('should find Shopify, NPM, PyPI tokens', () => {
        const mask = new SecretMask();
        const text = "Shopify: shpat_abcdefghijklmnopqrstuvwxyz012345 NPM: npm_abcdefghijklmnopqrstuvwxyz0123456789 PyPI: pypi-abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrst";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches).toContain('shpat_abcdefghijklmnopqrstuvwxyz012345');
        expect(matches).toContain('npm_abcdefghijklmnopqrstuvwxyz0123456789');
        expect(matches).toContain('pypi-abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrst');
    });

    it('should find sensitive context and key-value formats', () => {
        const mask = new SecretMask();
        const text = "otp = 123456 and your pin: 98765 and password is abcdefgh and Bearer abcdefghijklmnopqrstuvwx and api_key = abcdefghijklmnopqrstuvwx";
        const matches = Array.from(mask.find(text)).map(m => m[0]);
        expect(matches.some(m => m.includes('123456'))).toBe(true);
        expect(matches.some(m => m.includes('98765'))).toBe(true);
        expect(matches.some(m => m.includes('abcdefgh'))).toBe(true);
        expect(matches.some(m => m.includes('Bearer abcdefghijklmnopqrstuvwx'))).toBe(true);
        expect(matches.some(m => m.includes('api_key = abcdefghijklmnopqrstuvwx'))).toBe(true);
    });

    it('should find SSH and PGP Private Keys', () => {
        const mask = new SecretMask();
        const text1 = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtcn
-----END OPENSSH PRIVATE KEY-----`;
        const text2 = `-----BEGIN PGP PRIVATE KEY BLOCK-----
Version: GnuPG v2
lQOYBF2W...
-----END PGP PRIVATE KEY BLOCK-----`;
        const matches1 = Array.from(mask.find(text1)).map(m => m[0]);
        const matches2 = Array.from(mask.find(text2)).map(m => m[0]);
        expect(matches1).toContain(text1);
        expect(matches2).toContain(text2);
    });

});