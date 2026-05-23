import { piiBaseMask } from './piiBaseMask.js';

export default class SecretMask extends piiBaseMask {

    constructor() {
        super("SECRET");
        this.patterns = [

            // --- CLOUD PROVIDER KEYS ---
            // AWS
            /\bAKIA[0-9A-Z]{16}\b/gi,
            /\bASIA[0-9A-Z]{16}\b/gi,

            // Azure (contextual - only near azure-specific keywords)
            /(?:azure|tenant[_\s-]?id|AZURE_[A-Z_]+)\s*[=:]\s*['"]?([a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12})['"]?/gi,

            // Google
            /\bAIza[0-9A-Za-z\-_]{35,}\b/gi,

            // --- VCS & CI/CD TOKENS ---
            /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/gi,
            /\bgithub_pat_[A-Za-z0-9_]{22,}\b/gi,
            /\bglpat-[A-Za-z0-9\-_]{20,}\b/gi,
            /\bglptt-[A-Za-z0-9\-_]{20,}\b/gi,

            // --- JWT TOKENS ---
            /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,

            // --- DATABASE CONNECTIONS ---
            /(?:mongodb|postgres|mysql|redis|amqp|amqps):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,

            // --- PAYMENT PLATFORMS ---
            // Stripe
            /\bsk_live_[A-Za-z0-9]{24,}\b/gi,
            /\bsk_test_[A-Za-z0-9]{24,}\b/gi,
            /\bpk_live_[A-Za-z0-9]{24,}\b/gi,
            /\bpk_test_[A-Za-z0-9]{24,}\b/gi,

            // Square
            /\bsq0atp-[A-Za-z0-9\-_]{22,}\b/gi,
            /\bsq0csp-[A-Za-z0-9\-_]{22,}\b/gi,

            // Razorpay
            /\brzp_live_[A-Za-z0-9]{14,}\b/gi,
            /\brzp_test_[A-Za-z0-9]{14,}\b/gi,

            // Paytm
            /\bpaytm[_\s-]?(?:key|secret|token)[\s:=]+['"]?([A-Za-z0-9]{20,})['"]?/gi,
            /\b(?:merchant[_\s-]?key|merchant[_\s-]?id)[\s:=]+['"]?([A-Za-z0-9]{20,})['"]?/gi,

            // --- COMMUNICATION & MESSAGING ---
            // Twilio
            /\bAC[a-z0-9]{32}\b/gi,
            /\b(?:twilio[_\s-]?auth[_\s-]?token|auth[_\s-]?token)[\s:=]+['"]?([A-Za-z0-9]{32,})['"]?/gi,

            // Slack
            /\bxox[bpsare]-[A-Za-z0-9\-]{10,}\b/gi,

            // Discord webhook
            /\bhttps:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+\b/gi,

            // Telegram bot
            /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/gi,

            // SendGrid
            /\bSG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{22,}\b/gi,

            // Mailgun (contextual to avoid false positives)
            /(?:mailgun|MAILGUN_API_KEY)\s*[=:]\s*['"]?(key-[a-z0-9]{32,})['"]?/gi,

            // --- AI & ML PLATFORMS ---
            /\bsk-ant-[A-Za-z0-9\-_]{32,}\b/gi,
            /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9\-_]{32,}\b/gi,
            /\bgsk_[A-Za-z0-9]{48,}\b/gi,
            /\bhf_[A-Za-z0-9]{34,}\b/gi,

            // --- CLOUD PLATFORMS ---
            // Firebase
            /\bAAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140,}\b/gi,

            // Heroku (contextual)
            /(?:heroku[_\s-]?api[_\s-]?key|HEROKU_API_KEY)\s*[=:]\s*['"]?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})['"]?/gi,

            // Vercel
            /\bvc[pcirka]_[A-Za-z0-9_\-]{24,}\b/gi,

            // DigitalOcean
            /\bdop_v1_[a-f0-9]{64}\b/gi,
            /\bdoctl-[A-Za-z0-9\-]{40,}\b/gi,

            // Supabase
            /\bsbp_[a-f0-9]{40,}\b/gi,

            // Cloudflare (contextual)
            /(?:cloudflare|CF_API_TOKEN|CF_API_KEY)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{37,})['"]?/gi,

            // Datadog (contextual)
            /(?:datadog|dd)[_\s-]?(?:api[_\s-]?key|app[_\s-]?key|DD_API_KEY|DD_APP_KEY)\s*[=:]\s*['"]?([a-f0-9]{32,})['"]?/gi,

            // --- E-COMMERCE ---
            // Shopify
            /\bshp(?:at|ca|pa|ss|ua)_[A-Za-z0-9]{32,}\b/gi,

            // --- PACKAGE REGISTRIES ---
            /\bnpm_[A-Za-z0-9]{36,}\b/gi,
            /\bpypi-[A-Za-z0-9\-_]{50,}\b/gi,

            // --- SENSITIVE CONTEXT PATTERNS ---
            /(?:otp|pin|code|verification)[\s:=]+['"]?(\d{4,8})['"]?/gi,
            /\b(?:enter|your|the)[\s]+(?:otp|pin|code)[\s:]+(\d{4,8})\b/gi,
            /(?:password|passwd|pwd|secret|key|token|api)(?:\s+is)?[\s:=]+['"]?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})['"]?/gi,
            /(?:password|passwd|pwd)(?:\s+is)?[\s:=]+['"]?([A-Za-z0-9!@#$%^&*()_+\-=.]{8,})['"]?/gi,

            // Bearer Token (skips specific patterns)
            /\b(?:bearer|token)[\s:]+((?!ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|glptt-|sk_live_|sk_test_|pk_live_|pk_test_|sk-ant-|sk-(?:proj-)?[A-Za-z0-9]|xox[bpsare]-|npm_|hf_|gsk_|rzp_|shp(?:at|ca|pa|ss|ua)_|sq0|sbp_|dop_v1_|vc[pcirka]_)[A-Za-z0-9\-_.]{20,})\b/gi,

            // --- KEY=VALUE FORMAT PATTERNS ---
            /(?:api[_-]?key|apikey|api_key|api[_-]?secret|apisecret|api_secret)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi,
            /(?:secret[_-]?key|secretkey|secret_key)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi,
            /(?:access[_-]?key|accesskey|access_key|access[_-]?token|accesstoken|access_token)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi,
            /(?:auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi,

            // --- PRIVATE KEYS ---
            /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|EC\s+PRIVATE)\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?(?:PRIVATE|EC\s+PRIVATE)\s+KEY-----/gi,
            /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+OPENSSH\s+PRIVATE\s+KEY-----/gi,
            /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----[\s\S]*?-----END\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/gi,

            // --- GENERIC FALLBACKS ---
            /['"][A-Za-z0-9]{20,}['"]/g,
            /\b[A-Za-z0-9]{40,}\b/g,
            /\b[A-Za-z0-9+/]{40,}={0,2}\b/g
        ];
    }

    calculateEntropy(str) {
        if (!str) return 0;
        const freq = {};
        for (const char of str) {
            freq[char] = (freq[char] || 0) + 1;
        }
        let entropy = 0;
        const len = str.length;
        for (const count of Object.values(freq)) {
            const p = count / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    findHighEntropySecrets(text) {
        const candidates = [];
        const wordRegex = /[^\s"'`()[\]{},;]+/g;
        const seen = new Set();
        let wordMatch;

        while ((wordMatch = wordRegex.exec(text)) !== null) {
            const word = wordMatch[0];
            const wordStart = wordMatch.index;
            const trimmed = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
            const trimOffset = word.indexOf(trimmed);

            if (trimmed.length < 12) continue;

            if (word.startsWith('http') && word.includes('://')) continue;

            const alphanumOnly = trimmed.replace(/[^A-Za-z0-9]/g, "");
            if (alphanumOnly.length < 12) continue;
            if (this.calculateEntropy(alphanumOnly) < 4.2) continue;
            if (seen.has(trimmed)) continue;
            seen.add(trimmed);

            const start = wordStart + trimOffset;
            const end = start + trimmed.length;

            const ctxStart = Math.max(0, start - 2);
            const ctxEnd = Math.min(text.length, end + 2);
            const context = text.substring(ctxStart, ctxEnd);
            if (context.includes('[') || context.includes(']')) continue;

            candidates.push({
                start,
                end,
                text: trimmed
            });
        }

        return candidates;
    }

    find(text) {
        if (!text) return [];

        const allMatches = [];

        for (const regex of this.patterns) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                let matchedText = match[0];
                let start = match.index;

                if (match[1] !== undefined) {
                    const offset = match[0].indexOf(match[1]);
                    if (offset !== -1) {
                        start += offset;
                        matchedText = match[1];
                    }
                }

                if (matchedText.length === 0) {
                    regex.lastIndex = match.index + 1;
                    continue;
                }
                allMatches.push({
                    start: start,
                    end: start + matchedText.length,
                    text: matchedText
                });
                if (!regex.global) break;
            }
        }

        const entropyMatches = this.findHighEntropySecrets(text);
        for (const m of entropyMatches) {
            allMatches.push(m);
        }

        allMatches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

        const filtered = [];
        for (const m of allMatches) {
            if (filtered.length === 0 || m.start >= filtered[filtered.length - 1].end) {
                filtered.push(m);
            }
        }

        return filtered.map(m => [m.text]);
    }

    validate(matchText, mode = 'strict') {
        return true;
    }

}