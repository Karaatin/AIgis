import { piiBaseMask } from './piiBaseMask.js';

export default class URLMask extends piiBaseMask {
    constructor() {
        super("URL");
        this.regex = this.buildRegex();
    }

    buildRegex() {

        const tlds = [
            'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'eu',
            'io', 'ai', 'co', 'me', 'app', 'dev', 'tech', 'cloud', 'xyz', 'site', 'online', 'info', 'biz', 'so', 'ly', 'tv', 'cc', 'to',
            'de', 'ch', 'at', 'us', 'uk', 'fr', 'es', 'it', 'nl', 'be', 'ru', 'cn', 'jp', 'br', 'in', 'ca', 'au', 'se', 'no', 'dk', 'fi', 'cz',
            'pl', 'sh', 'py',
            'local', 'test', 'example'
        ];
        
        const tldGroup = tlds.join('|');
        const urlChars = `[-a-zA-Z0-9@:%._\\+~#=]{1,256}`;
        const safeEndChar = `[-a-zA-Z0-9()@:%_\\+~#&/=]`;
        const pathQueryChars = `(?:[-a-zA-Z0-9()@:%_\\+.~#?&//=]*${safeEndChar})?`;

        const protocolRegex = `(?:\\b(?:https?:\\/\\/|www\\.)${urlChars}\\.[a-zA-Z0-9()]{1,6}\\b${pathQueryChars})`;
        const localhostRegex = `(?:\\b(?:localhost|127\\.0\\.0\\.1)(?::\\d+)?(?:${pathQueryChars})?)`;
        const nakedRegex = `(?:\\b${urlChars}\\.(?:${tldGroup})\\b${pathQueryChars})`;

        const pattern = `(${localhostRegex}|${protocolRegex}|${nakedRegex})`;

        return new RegExp(pattern, 'gi');

    }

    find(text) {

        return text.matchAll(this.regex);

    }

    validate(matchText, mode = 'strict') {

        const lower = matchText.toLowerCase();

        if (!matchText.includes('.') && !lower.includes('localhost')) return false;

        if (mode === 'developer') {
            const isLocalOrDev = 
                lower.includes('localhost') ||
                lower.includes('127.0.0.1') ||
                lower.endsWith('.local') ||
                lower.endsWith('.test') ||
                lower.endsWith('.example');

            const isScriptFile = 
                (lower.endsWith('.py') || lower.endsWith('.sh') || lower.endsWith('.pl')) &&
                !lower.startsWith('http') && !lower.startsWith('www');

            if (isLocalOrDev || isScriptFile) {
                return false;
            }
        }
        
        return true;

    }
}