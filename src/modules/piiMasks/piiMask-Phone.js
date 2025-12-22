import { piiBaseMask } from './piiBaseMask.js';

export default class PhoneMask extends piiBaseMask {

    constructor() {

        super("PHONE_NUMBER");

    }

    find(text, mode = 'strict') {

        const international = /(?:(?<=\s|^)\+|(?<=\s|^|\b)00)(?:[0-9][\s\-\(\)\.\/]{0,2}){6,14}[0-9]/gi;
        
        const national = /(?:(?<=\s|^)\(?|\b)0[0-9]{1,5}\)?[\s\-\.\/]{1,3}[0-9]{3,}(?:[\s\-\.\/][0-9]{2,})*\b/gi;

        const regex = new RegExp(`(${international.source}|${national.source})`, 'gi');
        
        return text.matchAll(regex);

    }

    validate(matchText, mode = 'strict') {

        const digits = matchText.replace(/[^0-9]/g, '');

        if (digits.length < 7 || digits.length > 15) return false;

        if (matchText.includes('-')) {
            if (matchText.match(/^(19|20)\d{2}-\d{2}-\d{2}/)) return false;
        }

        return true;
        
    }
}