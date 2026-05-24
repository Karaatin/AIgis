import { piiBaseMask } from './piiBaseMask.js';

export default class EmailMask extends piiBaseMask {

    constructor() {

        super("EMAIL");

    }

    find(text) {

        const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
        return text.matchAll(regex);

    }

    validate(matchText, mode = 'strict') {
        if (mode === 'developer') {
            const email = matchText.trim().toLowerCase();
            if (
                email.endsWith('@example.com') ||
                email.endsWith('@example.org') ||
                email.endsWith('@example.net') ||
                email.endsWith('@test.com') ||
                email.endsWith('.local') ||
                email.endsWith('@localhost')
            ) {
                return false;
            }
        }
        return true;
    }

}