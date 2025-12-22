import { piiBaseMask } from './piiBaseMask.js';

export default class IBANMask extends piiBaseMask {

    constructor() {
        super('IBAN');
    }

    find(text) {
        const regex = /\b[A-Z]{2}\d{2}(?:[A-Z0-9\s]*\d|[A-Z0-9]+)\b/gi;
        return text.matchAll(regex);
    }

    validate(matchText) {

        const iban = matchText.replace(/\s+/g, '').toUpperCase();

        if (iban.length < 15 || iban.length > 34) return false;

        const rearranged = iban.slice(4) + iban.slice(0, 4);

        const numberString = rearranged.split('').map(char => {
            const code = char.charCodeAt(0);
            if (code >= 48 && code <= 57) return char; // 0-9
            if (code >= 65 && code <= 90) return (code - 55).toString(); // A-Z
            return ''; 
        }).join('');

        try {
            return BigInt(numberString) % 97n === 1n;
        } catch (e) {
            return false;
        }
    }
}