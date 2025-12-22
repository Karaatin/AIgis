import { piiBaseMask } from './piiBaseMask.js';

export default class AddressMask extends piiBaseMask {

    constructor() {

        super("ADDRESS");

    }

    find(text, mode = 'strict') {

        const streetPart = /(?:[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\.-]*\s+)+/;

        const houseNumPart = /\d+[a-zA-Z]?(?:[-\/]\d+)?/;

        const separator = /[\s,\n]+/;

        const cityPart = /(?:(?:D|A|CH)-)?\d{4,5}\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\.-]+/;

        const regex = new RegExp(`\\b${streetPart.source}${houseNumPart.source}${separator.source}${cityPart.source}\\b`, 'g');

        return text.matchAll(regex);

    }

    validate(matchText, mode = 'strict') {

        if (matchText.length < 10) return false;
        if (!/\d/.test(matchText)) return false;
        return true;

    }

}