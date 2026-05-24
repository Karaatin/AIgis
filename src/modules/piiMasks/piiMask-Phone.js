import { piiBaseMask } from './piiBaseMask.js';

export default class PhoneMask extends piiBaseMask {

    constructor() {

        super("PHONE_NUMBER");

    }

    find(text) {

        const international = /(?:(?<=\s|^)\+|(?<=\s|^|\b)00)(?:[0-9][\s\-\(\)\.\/]{0,2}){6,14}[0-9]/gi;

        const national = /(?:(?<=\s|^)\(?|\b)0[0-9]{1,5}\)?[\s\-\.\/]{0,3}[0-9]{3,}(?:[\s\-\.\/][0-9]{2,})*\b/gi;

        const us_national = /(?:(?<=\s|^)\(?|\b)[0-9]{3}\)?[\s\-\.]?[0-9]{3}[\s\-\.]?[0-9]{4}\b/gi;

        const regex = new RegExp(`(${international.source}|${national.source}|${us_national.source})`, 'gi');

        return text.matchAll(regex);

    }

    validate(matchText, mode = 'strict') {

        const digits = matchText.replace(/[^0-9]/g, '');

        if (digits.length < 7 || digits.length > 15) return false;

        if (matchText.includes('-')) {
            if (matchText.match(/^(19|20)\d{2}-\d{2}-\d{2}/)) return false;
        }

        if (mode === 'developer') {
            // Repetitive (e.g. 1111111) or sequential (e.g. 12345678)
            if (/^(.)\1+$/.test(digits)) return false;
            if ('123456789012345'.includes(digits) || '0123456789'.includes(digits)) return false;
        }

        return true;

    }
}