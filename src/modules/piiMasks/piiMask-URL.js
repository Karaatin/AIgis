import tlds from 'tlds';
import { piiBaseMask } from './piiBaseMask.js';

export default class URLMask extends piiBaseMask {
    constructor() {
        super("URL");
        this.regex = this.buildRegex();
    }

    buildRegex() {

        const customDevTlds = ['local', 'test', 'example'];
        const allTlds = Array.from(new Set([...tlds, ...customDevTlds]));
        
        const tldGroup = allTlds.join('|');
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

            const fileExtensions = ['.py', '.sh', '.pl', '.rs', '.java', '.md', '.zip', '.so', '.app'];
            const isScriptFile = 
                fileExtensions.some(ext => lower.endsWith(ext)) &&
                !lower.startsWith('http') && !lower.startsWith('www');

            if (isLocalOrDev || isScriptFile) {
                return false;
            }
        }
        
        return true;

    }
}