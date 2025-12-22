import { piiBaseMask } from './piiBaseMask.js';

export default class IPMask extends piiBaseMask {
    
    constructor() {
        super("IP_ADDRESS");
    }

    find(text, mode = 'strict') {
        const octet = '(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
        const ipv4 = `\\b(?:${octet}\\.){3}${octet}\\b`;

        const ipv6Parts = [
            `\\b(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,7}:\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,6}:[A-F0-9]{1,4}\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,5}(?::[A-F0-9]{1,4}){1,2}\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,4}(?::[A-F0-9]{1,4}){1,3}\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,3}(?::[A-F0-9]{1,4}){1,4}\\b`,
            `\\b(?:[A-F0-9]{1,4}:){1,2}(?::[A-F0-9]{1,4}){1,5}\\b`,
            `\\b[A-F0-9]{1,4}:(?:(?::[A-F0-9]{1,4}){1,6})\\b`,
            `(?<=\\s|^):(?:(?::[A-F0-9]{1,4}){1,7}|:)(?=\\s|$)`
        ];
        const ipv6 = ipv6Parts.join('|');
        const regex = new RegExp(`(${ipv4}|${ipv6})`, 'gi');

        const matches = text.matchAll(regex);

        if (mode === 'strict') {
            return matches;
        }

        // Developer Mode: Filterung via Generator
        return (function* () {
            for (const match of matches) {
                const ip = match[0];
                const lowerIP = ip.toLowerCase();

                // IPv6 Loopback & Link-Local
                if (ip === '::1' || ip === '::' || lowerIP.startsWith('fe80:')) continue;
                
                // IPv4 Loopback & General
                if (ip.startsWith('127.') || ip === '0.0.0.0') continue;

                // Private Ranges
                if (ip.startsWith('10.') || ip.startsWith('192.168.')) continue;
                if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) continue;

                yield match;
            }
        })();
    }

    validate(matchText, mode = 'strict') {
        return true;
    }
}